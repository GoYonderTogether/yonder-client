import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildDesktopManifest, uploadDesktopRelease, verifyUpdaterSignature } from "./desktop.mjs";
import { updaterConfig } from "./tauri-updater-config.mjs";

const version = "0.3.26111502";
function signedArtifact(artifact, signedVersion = version) {
	const { privateKey, publicKey } = generateKeyPairSync("ed25519");
	const id = randomBytes(8);
	const rawKey = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
	const pubkey = Buffer.from(
		`untrusted comment: public key\n${Buffer.concat([Buffer.from("Ed"), id, rawKey]).toString("base64")}\n`,
	).toString("base64");
	const payloadSignature = sign(null, createHash("blake2b512").update(artifact).digest(), privateKey);
	const comment = `timestamp:1\tfile:Yonder.app.tar.gz\tversion:${signedVersion}`;
	const globalSignature = sign(null, Buffer.concat([payloadSignature, Buffer.from(comment)]), privateKey);
	const signature = Buffer.from(
		`untrusted comment: signature\n${Buffer.concat([Buffer.from("ED"), id, payloadSignature]).toString("base64")}\ntrusted comment: ${comment}\n${globalSignature.toString("base64")}\n`,
	).toString("base64");
	return { pubkey, signature };
}

test("release overlay requires a valid public key and current release version", () => {
	const { pubkey } = signedArtifact(Buffer.from("artifact"));
	assert.deepEqual(updaterConfig({ pubkey, version }), { version, plugins: { updater: { pubkey } } });
	assert.throws(() => updaterConfig({ version }), /TAURI_UPDATER_PUBKEY/);
	assert.throws(() => updaterConfig({ pubkey: "placeholder", version }), /base64|公钥/);
	assert.throws(() => updaterConfig({ pubkey, version: "invalid" }), /版本号/);
});

test("signature binds bytes, public key, and the trusted release version", () => {
	const artifact = Buffer.from("original archive");
	const { pubkey, signature } = signedArtifact(artifact);
	assert.equal(verifyUpdaterSignature({ artifact, signature, pubkey, version }), signature);
	assert.throws(
		() => verifyUpdaterSignature({ artifact: Buffer.from("changed"), signature, pubkey, version }),
		/签名验证失败/,
	);
	assert.throws(
		() => verifyUpdaterSignature({ artifact, signature, pubkey: signedArtifact(artifact).pubkey, version }),
		/公钥不匹配/,
	);
	assert.throws(() => verifyUpdaterSignature({ artifact, signature, pubkey, version: "0.3.26111503" }), /版本/);
	assert.throws(() => verifyUpdaterSignature({ artifact, signature: "fake", pubkey, version }), /签名/);
});

test("manifest uses Tauri static schema and only the selected platform", () => {
	const manifest = buildDesktopManifest({
		version,
		target: "darwin-aarch64",
		artifactName: "Yonder.app.tar.gz",
		signature: "sig",
		publishedAt: "2026-11-15T00:00:00Z",
	});
	assert.deepEqual(manifest, {
		version,
		pub_date: "2026-11-15T00:00:00Z",
		platforms: {
			"darwin-aarch64": { signature: "sig", url: `https://dl.zethai.cn/desktop/${version}/Yonder.app.tar.gz` },
		},
	});
	assert.throws(
		() => buildDesktopManifest({ version, target: "darwin-aarch64", artifactName: "../archive", signature: "sig" }),
		/更新包/,
	);
});

test("publishing validates signature, rejects rollback, and uploads artifact before manifest", async (t) => {
	const dir = mkdtempSync(join(tmpdir(), "yonder-update-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const artifact = Buffer.from("archive");
	const { pubkey, signature } = signedArtifact(artifact);
	const artifactPath = join(dir, "Yonder.app.tar.gz");
	const signaturePath = `${artifactPath}.sig`;
	writeFileSync(artifactPath, artifact);
	writeFileSync(signaturePath, signature);
	const calls = [];
	let currentVersion = "0.3.26111499";
	const transport = {
		async getObject({ key }) {
			calls.push(`GET ${key}`);
			return Buffer.from(JSON.stringify({ version: currentVersion }));
		},
		async putObject({ key }) {
			calls.push(`PUT ${key}`);
		},
	};
	const options = { version, target: "darwin-aarch64", artifactPath, signaturePath, pubkey, transport, log: () => {} };
	await uploadDesktopRelease(options);
	assert.deepEqual(calls, [
		"GET desktop/darwin.json",
		`PUT desktop/${version}/Yonder.app.tar.gz`,
		"PUT desktop/darwin.json",
	]);
	calls.length = 0;
	currentVersion = "0.3.26111510";
	await assert.rejects(uploadDesktopRelease(options), /低于线上/);
	assert.deepEqual(calls, ["GET desktop/darwin.json"]);
	calls.length = 0;
	writeFileSync(artifactPath, "modified");
	await assert.rejects(uploadDesktopRelease(options), /签名验证失败/);
	assert.deepEqual(calls, []);
});
