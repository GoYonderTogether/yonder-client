// 安卓发布产物：versionCode 推导、latest.json 清单与 OSS 上传。
// 版本不读仓库文件：由 --version 传入本次 Release 的版本（apps/desktop 不在 npm workspaces，
// bump-versions.mjs 不改它的 package.json / tauri.conf.json）。

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { BUCKET, getObject, PUBLIC_BASE_URL, putObject, REGION_ENDPOINT, readCredentials } from "./oss.mjs";
import { compareVersions, parseVersion } from "./version.mjs";

export const APK_OBJECT = "android/yonder-android.apk";
export const LATEST_OBJECT = "android/latest.json";

/**
 * `0.<minor>.<YYMMDDNN>` → Android versionCode `YYMMDDNN`。
 * 与仓库里既有的 26103020 同一量纲：按日期与当天序号单调递增，且不依赖 minor。
 * 八位数最大 99999999，始终在 Android 允许的 2100000000 上限之内。
 */
export function androidVersionCode(version) {
	const parsed = parseVersion(version);
	if (!parsed) throw new Error(`版本号不是 0.<minor>.<YYMMDDNN>：${version}`);
	const code = Number(`${parsed.date}${String(parsed.sequence).padStart(2, "0")}`);
	if (!Number.isSafeInteger(code) || code < 1) throw new Error(`无法从 ${version} 推出 versionCode`);
	return code;
}

export function versionedApkPath(version) {
	return `android/yonder-${version}.apk`;
}

export function publicUrl(key) {
	return `${PUBLIC_BASE_URL}/${key}`;
}

export function sha256(buffer) {
	return createHash("sha256").update(buffer).digest("hex");
}

/** Read metadata from the built APK, never assume Gradle applied the requested version. */
export function parseApkMetadata(badging) {
	const line = badging.split("\n").find((entry) => entry.startsWith("package: ")) ?? "";
	const code = /\bversionCode='(\d+)'/.exec(line)?.[1];
	const versionName = /\bversionName='([^']+)'/.exec(line)?.[1];
	if (!code || !versionName) throw new Error("无法从 APK 读取 versionCode/versionName");
	return { versionCode: Number(code), versionName };
}

export function readApkMetadata(apkPath, aapt = "aapt") {
	return parseApkMetadata(execFileSync(aapt, ["dump", "badging", apkPath], { encoding: "utf8" }));
}

/** latest.json versionCode is taken from the actual APK, and the minimum is opt-in. */
export function buildManifest({ version, versionCode, apk, minSupportedVersion = null, notes, publishedAt }) {
	if (versionCode !== androidVersionCode(version)) throw new Error("APK versionCode 与发布版本不一致");
	if (
		minSupportedVersion !== null &&
		(!parseVersion(minSupportedVersion) || compareVersions(minSupportedVersion, version) > 0)
	) {
		throw new Error("minSupportedVersion 必须是有效版本且不高于发布版本");
	}
	const digest = sha256(apk);
	const manifest = {
		version,
		versionCode,
		minSupportedVersion,
		url: publicUrl(versionedApkPath(version)),
		sha256: digest,
		size: apk.length,
	};
	if (notes) manifest.notes = notes;
	if (publishedAt) manifest.publishedAt = publishedAt;
	return manifest;
}

/**
 * 客户端只按 versionCode 比较，所以清单回退（重发旧版本、或当天序号写错）会让已升级的设备
 * 收不到新版本，也可能被降级覆盖。新清单的 versionCode 必须严格大于线上的那份。
 *
 * `rebuild` 是唯一例外：手工重出同一个版本的安装包（例如发版后修了构建问题），
 * versionCode 相同但 APK 摘要不同。只允许「相等」，降级仍然拒绝。
 */
export function assertNewerManifest(next, current, { rebuild = false } = {}) {
	if (!current) return;
	const currentCode = Number(current.versionCode);
	if (!Number.isFinite(currentCode)) throw new Error("线上 latest.json 的 versionCode 不是数字，拒绝覆盖");
	if (rebuild && next.versionCode === currentCode) return;
	if (next.versionCode <= currentCode) {
		throw new Error(
			`versionCode ${next.versionCode}（${next.version}）不高于线上 ${currentCode}（${current.version ?? "未知"}）；拒绝发布`,
		);
	}
}

/** 从 Release 正文取出给客户端显示的说明；缺省返回 undefined，不写占位文本。 */
export function readNotes(path) {
	if (!path) return undefined;
	const text = readFileSync(path, "utf8").trim();
	return text === "" ? undefined : text;
}

export async function uploadAndroidRelease({
	version,
	versionCode,
	apkPath,
	minSupportedVersion = null,
	notes,
	credentials,
	dryRun = false,
	// 仅用于修正已发布版本的清单（例如下载地址政策变化）：版本号与 APK 摘要必须完全一致，
	// 只允许换 url/notes 这类非版本字段，不能让旧版本重新变成"可升级"。
	repair = false,
	// 手工重出同一个版本的安装包：versionCode 不变、APK 摘要会变。只放行「同版本」，
	// 降级仍然拒绝；与 repair 的区别是不要求摘要一致。
	rebuild = false,
	bucket = BUCKET,
	endpoint = REGION_ENDPOINT,
	now = new Date(),
	log = console.log,
	// 测试注入用的传输层；生产路径直接用 oss.mjs 的实现。
	transport = { putObject, getObject },
}) {
	const apk = readFileSync(apkPath);
	const manifest = buildManifest({
		version,
		versionCode,
		apk,
		minSupportedVersion,
		notes,
		publishedAt: now.toISOString(),
	});
	if (dryRun) {
		log(
			JSON.stringify(
				{ apk: basename(apkPath), objects: [versionedApkPath(version), APK_OBJECT, LATEST_OBJECT], manifest },
				null,
				2,
			),
		);
		return { manifest, uploaded: false };
	}
	const existing = await transport.getObject({ key: LATEST_OBJECT, credentials, bucket, endpoint });
	if (existing) {
		let parsed;
		try {
			parsed = JSON.parse(existing.toString("utf8"));
		} catch {
			throw new Error(`${LATEST_OBJECT} 不是合法 JSON，拒绝覆盖`);
		}
		if (repair) {
			const same = parsed.versionCode === manifest.versionCode && parsed.sha256 === manifest.sha256;
			if (!same) throw new Error("repair 只允许修正同一 versionCode 与同一 APK 摘要的清单");
		} else assertNewerManifest(manifest, parsed, { rebuild });
	}
	// 版本化对象在前、latest.json 在后：清单一旦指向某个 URL，APK 已经可下载。
	await transport.putObject({
		key: versionedApkPath(version),
		body: apk,
		contentType: "application/vnd.android.package-archive",
		credentials,
		bucket,
		endpoint,
	});
	await transport.putObject({
		key: APK_OBJECT,
		body: apk,
		contentType: "application/vnd.android.package-archive",
		credentials,
		bucket,
		endpoint,
	});
	await transport.putObject({
		key: LATEST_OBJECT,
		body: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
		contentType: "application/json; charset=utf-8",
		credentials,
		bucket,
		endpoint,
	});
	log(`已上传 ${versionedApkPath(version)}、${APK_OBJECT}、${LATEST_OBJECT}（versionCode ${manifest.versionCode}）`);
	return { manifest, uploaded: true };
}

function main(argv) {
	const flag = (name) => {
		const index = argv.indexOf(name);
		return index === -1 ? undefined : (argv[index + 1] ?? "");
	};
	const version = flag("--version");
	const apkPath = flag("--apk");
	const repair = argv.includes("--repair");
	const rebuild = argv.includes("--rebuild");
	try {
		if (!version || !apkPath) {
			console.error(
				"用法：android.mjs --version <版本> --apk <apk 路径> [--aapt <路径>] [--min-supported-version <版本>] [--notes <文件>] [--rebuild] [--repair] [--dry-run]",
			);
			return 2;
		}
		const dryRun = argv.includes("--dry-run");
		const metadata = readApkMetadata(apkPath, flag("--aapt") || "aapt");
		if (metadata.versionName !== version) throw new Error("APK versionName 与发布版本不一致");
		const credentials = dryRun ? null : readCredentials();
		return uploadAndroidRelease({
			version,
			versionCode: metadata.versionCode,
			apkPath,
			minSupportedVersion: flag("--min-supported-version") || null,
			notes: readNotes(flag("--notes")),
			repair,
			rebuild,
			credentials,
			dryRun,
		}).then(
			(result) => {
				if (!result.uploaded) console.log(`versionCode ${result.manifest.versionCode}（dry-run）`);
				return 0;
			},
			(error) => {
				console.error(error.message);
				return 1;
			},
		);
	} catch (error) {
		console.error(error.message);
		return 1;
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	Promise.resolve(main(process.argv.slice(2))).then((code) => {
		process.exitCode = code;
	});
}
