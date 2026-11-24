// Signatures are made by `tauri signer sign`; publish only an artifact verified with the
// same public key embedded into the app. The static JSON follows Tauri's updater schema.
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
	BUCKET,
	contentTypeFor,
	getObject,
	getPublicReleaseObject,
	PUBLIC_BASE_URL,
	putObject,
	REGION_ENDPOINT,
	readCredentials,
} from "./oss.mjs";
import { decodeBase64, updaterPublicKey } from "./tauri-updater-config.mjs";
import { compareVersions, parseVersion } from "./version.mjs";

const TARGETS = { "darwin-aarch64": "darwin", "windows-x86_64": "windows" };

export function verifyUpdaterSignature({ artifact, signature, pubkey, version }) {
	const publicText = decodeBase64(updaterPublicKey(pubkey), "updater 公钥").toString("utf8");
	const publicBytes = decodeBase64(publicText.trim().split(/\r?\n/)[1], "updater 公钥");
	const lines = decodeBase64(signature.trim(), "updater 签名").toString("utf8").trim().split(/\r?\n/);
	const signed = decodeBase64(lines[1], "updater 签名");
	const global = decodeBase64(lines[3], "updater 签名");
	if (
		!lines[0]?.startsWith("untrusted comment:") ||
		!lines[2]?.startsWith("trusted comment: ") ||
		signed.length !== 74 ||
		global.length !== 64 ||
		signed[0] !== 0x45 ||
		![0x44, 0x64].includes(signed[1]) ||
		!publicBytes.subarray(2, 10).equals(signed.subarray(2, 10))
	) {
		throw new Error("updater 签名格式错误或公钥不匹配");
	}
	const comment = lines[2].slice("trusted comment: ".length);
	if (!comment.split("\t").includes(`version:${version}`)) throw new Error("updater 签名版本与发布版本不一致");
	// Minisign encodes the Ed25519 key and signs both the payload (optionally BLAKE2b-prehashed)
	// and the trusted comment. Node's native crypto verifies the same two signatures as Tauri.
	const key = createPublicKey({
		key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), publicBytes.subarray(10)]),
		format: "der",
		type: "spki",
	});
	const data = signed[1] === 0x44 ? createHash("blake2b512").update(artifact).digest() : artifact;
	if (
		!verify(null, data, key, signed.subarray(10)) ||
		!verify(null, Buffer.concat([signed.subarray(10), Buffer.from(comment)]), key, global)
	) {
		throw new Error("updater 签名验证失败");
	}
	return signature.trim();
}

export function buildDesktopManifest({ version, target, artifactName, signature, notes, publishedAt }) {
	if (!parseVersion(version)) throw new Error(`版本号不合法：${version}`);
	if (!Object.hasOwn(TARGETS, target)) throw new Error(`不支持的桌面目标：${target}`);
	if (!artifactName || basename(artifactName) !== artifactName || !signature) throw new Error("缺少更新包或签名");
	const key = `desktop/${version}/${artifactName}`;
	return {
		version,
		...(notes ? { notes } : {}),
		...(publishedAt ? { pub_date: publishedAt } : {}),
		platforms: {
			[target]: { signature, url: `${PUBLIC_BASE_URL}/${key.split("/").map(encodeURIComponent).join("/")}` },
		},
	};
}

export async function uploadDesktopRelease({
	version,
	target,
	artifactPath,
	signaturePath,
	pubkey,
	notes,
	credentials,
	bucket = BUCKET,
	endpoint = REGION_ENDPOINT,
	now = new Date(),
	dryRun = false,
	log = console.log,
	transport = { putObject, getObject, getPublicReleaseObject },
}) {
	const artifact = readFileSync(artifactPath);
	if (!artifact.length) throw new Error("更新包为空");
	const signature = verifyUpdaterSignature({
		artifact,
		signature: readFileSync(signaturePath, "utf8"),
		pubkey,
		version,
	});
	const artifactName = basename(artifactPath);
	const manifest = buildDesktopManifest({
		version,
		target,
		artifactName,
		signature,
		notes,
		publishedAt: now.toISOString(),
	});
	const manifestKey = `desktop/${TARGETS[target]}.json`;
	const artifactKey = `desktop/${version}/${artifactName}`;
	if (dryRun) {
		log(`dry-run: ${artifactKey}, ${manifestKey}`);
		return { manifest, uploaded: false };
	}
	const existing = await transport.getObject({ key: manifestKey, credentials, bucket, endpoint });
	if (existing) {
		let current;
		try {
			current = JSON.parse(existing.toString("utf8"));
		} catch {
			throw new Error(`${manifestKey} 不是合法 JSON`);
		}
		if (compareVersions(version, current.version) < 0)
			throw new Error(`${version} 低于线上 ${current.version}，拒绝覆盖`);
	}
	await transport.putObject({
		key: artifactKey,
		body: artifact,
		contentType: contentTypeFor(artifactName),
		credentials,
		bucket,
		endpoint,
	});
	// Do not advertise a signed artifact that the public updater could not actually download.
	const publicArtifact = await transport.getPublicReleaseObject(artifactKey);
	if (!publicArtifact.equals(artifact)) throw new Error(`${artifactKey} 公开下载与待发布更新包不一致`);
	await transport.putObject({
		key: manifestKey,
		body: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
		contentType: "application/json; charset=utf-8",
		ossHeaders: { "Cache-Control": "no-cache" },
		credentials,
		bucket,
		endpoint,
	});
	log(`已上传 ${artifactKey}、${manifestKey}`);
	return { manifest, uploaded: true };
}

async function main(argv) {
	const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
	try {
		const [version, target, artifactPath, signaturePath] = [
			flag("--version"),
			flag("--target"),
			flag("--artifact"),
			flag("--signature"),
		];
		if (!version || !target || !artifactPath || !signaturePath)
			throw new Error("需要 --version --target --artifact --signature");
		const dryRun = argv.includes("--dry-run");
		const notesPath = flag("--notes");
		await uploadDesktopRelease({
			version,
			target,
			artifactPath,
			signaturePath,
			pubkey: process.env.TAURI_UPDATER_PUBKEY,
			notes: notesPath ? readFileSync(notesPath, "utf8").trim() : undefined,
			credentials: dryRun ? null : readCredentials(),
			dryRun,
		});
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main(process.argv.slice(2));
