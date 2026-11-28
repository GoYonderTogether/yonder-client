import { fileURLToPath } from "node:url";
import { APK_OBJECT, androidVersionCode, LATEST_OBJECT, sha256, versionedApkPath } from "./android.mjs";
import { verifyUpdaterSignature } from "./desktop.mjs";
import { getObject, getPublicReleaseObject, PUBLIC_BASE_URL, putObject, readCredentials } from "./oss.mjs";
import { compareVersions, parseVersion } from "./version.mjs";

/** Only advance stable pointers to the already-published versioned beta bytes. */
export async function promoteNative({
	version,
	credentials,
	pubkey,
	transport = { getObject, getPublicReleaseObject, putObject },
}) {
	if (!parseVersion(version)) throw new Error("需要一个有效的候选版本");
	const apkPath = versionedApkPath(version);
	const targets = [
		{ source: `beta/desktop/${version}/darwin.json`, key: "desktop/darwin.json" },
		{ source: `beta/desktop/${version}/windows.json`, key: "desktop/windows.json" },
		{ source: `beta/android/${version}/latest.json`, key: LATEST_OBJECT },
	];
	const [mac, windows, android] = await Promise.all(
		targets.map(async ({ source, key }) => {
			const [body, existing] = await Promise.all([
				transport.getObject({ key: source, credentials }),
				transport.getObject({ key, credentials }),
			]);
			if (!body) throw new Error(`候选产物尚未核验：${source}`);
			const manifest = JSON.parse(body.toString("utf8"));
			if (manifest.version !== version) throw new Error(`候选清单版本不符：${source}`);
			if (existing) {
				const live = JSON.parse(existing.toString("utf8"));
				const relative = compareVersions(version, live.version);
				if (relative < 0 || (relative === 0 && !existing.equals(body))) {
					throw new Error(`拒绝回退或覆盖正式清单：${key}`);
				}
				if (key === LATEST_OBJECT && live.versionCode > manifest.versionCode) {
					throw new Error("候选 APK 的构建号低于正式 APK");
				}
			}
			return { key, body, manifest };
		}),
	);
	const verifyDesktop = async (publication, target, artifact) => {
		const key = `desktop/${version}/${artifact}`;
		const platform = publication.manifest.platforms?.[target];
		if (platform?.url !== `${PUBLIC_BASE_URL}/${key}`) throw new Error(`候选更新包地址不符：${target}`);
		const bytes = await transport.getPublicReleaseObject(key);
		verifyUpdaterSignature({ artifact: bytes, signature: platform.signature, pubkey, version });
	};
	const verifyAndroid = async (key) => {
		const bytes = await transport.getPublicReleaseObject(key);
		if (bytes.length !== android.manifest.size || sha256(bytes) !== android.manifest.sha256) {
			throw new Error(`候选 APK 与清单不一致：${key}`);
		}
	};
	if (
		android.manifest.url !== `${PUBLIC_BASE_URL}/${apkPath}` ||
		android.manifest.versionCode !== androidVersionCode(version)
	) {
		throw new Error("候选 APK 版本或地址不符");
	}
	await Promise.all([
		verifyDesktop(mac, "darwin-aarch64", "Yonder.app.tar.gz"),
		verifyDesktop(windows, "windows-x86_64", `Yonder_${version}_x64-setup.exe`),
		verifyAndroid(apkPath),
		transport.getPublicReleaseObject(`desktop/${version}/Yonder_${version}_aarch64.dmg`),
	]);
	await transport.putObject({ key: APK_OBJECT, copyFrom: apkPath, credentials });
	await verifyAndroid(APK_OBJECT);
	for (const { key, body } of [mac, windows, android]) {
		await transport.putObject({
			key,
			body,
			contentType: "application/json; charset=utf-8",
			credentials,
			ossHeaders: { "Cache-Control": "no-cache" },
		});
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	await promoteNative({
		version: process.argv[2],
		credentials: readCredentials(),
		pubkey: process.env.TAURI_UPDATER_PUBKEY,
	});
}
