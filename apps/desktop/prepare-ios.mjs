// 重放 `tauri ios init` 之后需要补在生成工程上的设置（按仓库的既有做法：生成目录不入库，
// 每次 init 之后由这里补回来）。桌面 / 移动两处入口共用这一份：
//   node apps/desktop/prepare-ios.mjs
//
// 做三件事，全部幂等：
//   1. App 图标：App Store 拒绝带 alpha 的 1024 图标（上传报 90717）。这里用
//      scripts/flatten-icon.swift 铺白底并去除 alpha，再重新生成整套尺寸。
//   2. 签名：写 DEVELOPMENT_TEAM / CODE_SIGN_STYLE=Manual / PROVISIONING_PROFILE_SPECIFIER，
//      并把 CODE_SIGN_IDENTITY 从 "iPhone Developer" 换成 "iPhone Distribution"
//      （前者只匹配开发证书，分发构建会报 No signing certificate）。
//   3. 团队 ID 与 profile 名可用环境变量覆盖（CI 用 secrets）：IOS_TEAM_ID / IOS_PROFILE_NAME。
//
// 真机调试装的是开发构建，签名方式和发版相反：Xcode 自动管理签名、用开发证书和
// "iOS Team Provisioning Profile"，profile 里必须包含这台机器的 UDID。
//   IOS_SIGNING_STYLE=development node apps/desktop/prepare-ios.mjs
// 不设这个变量时行为不变（Manual + 分发证书 + App Store profile），CI 走的就是这条路。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const apple = resolve(root, "src-tauri/gen/apple");
const projectFile = join(apple, "yonder-desktop.xcodeproj/project.pbxproj");
const infoPlist = join(apple, "yonder-desktop_iOS/Info.plist");
const entitlements = join(apple, "yonder-desktop_iOS/yonder-desktop_iOS.entitlements");
const iconSet = join(apple, "Assets.xcassets/AppIcon.appiconset");
const brandIcon = resolve(root, "../../brand/assets/png/yonder-tile-ink-1024.png");
const flutter = join(root, "scripts/flatten-icon.swift");

const team = process.env.IOS_TEAM_ID ?? "D4UZU32UN9";
const profile = process.env.IOS_PROFILE_NAME ?? "Yonder App Store";

if (!existsSync(apple) || !existsSync(projectFile)) {
	console.error(`prepare-ios: run \`tauri ios init\` first (${apple} is missing)`);
	process.exit(1);
}

/** 1. 图标：铺白底、去掉 alpha，再按 Contents.json 的尺寸重出整套。 */
function applyIcons() {
	if (!existsSync(iconSet) || !existsSync(brandIcon) || !existsSync(flutter)) {
		console.log("prepare-ios: icon sources missing; icons left as generated");
		return;
	}
	const binary = join(apple, ".flatten-icon");
	if (!existsSync(binary)) execFileSync("swiftc", ["-O", flutter, "-o", binary], { stdio: "inherit" });
	const opaque = join(apple, ".icon-opaque.png");
	execFileSync(binary, [brandIcon, opaque], { stdio: "inherit" });
	const contents = JSON.parse(readFileSync(join(iconSet, "Contents.json"), "utf8"));
	for (const image of contents.images) {
		if (!image.filename) continue;
		const points = Number.parseFloat(String(image.size).split("x")[0]);
		const scale = Number.parseInt(String(image.scale).replace("x", ""), 10);
		const pixels = String(Math.round(points * scale));
		execFileSync("sips", ["-z", pixels, pixels, opaque, "--out", join(iconSet, image.filename)], {
			stdio: "ignore",
		});
	}
	console.log("prepare-ios: app icons flattened (no alpha channel)");
}

/** 2. 签名设置；3. 团队与 profile 从环境变量取。 */
function applySigning() {
	let source = readFileSync(projectFile, "utf8");
	if (source.includes("DEVELOPMENT_TEAM")) {
		console.log("prepare-ios: signing settings already present");
		return;
	}
	if (!source.includes('CODE_SIGN_IDENTITY = "iPhone Developer";')) {
		console.error('prepare-ios: unexpected project layout (no CODE_SIGN_IDENTITY = "iPhone Developer")');
		process.exit(1);
	}
	// 开发构建交给 Xcode 自动管理：不写 PROVISIONING_PROFILE_SPECIFIER，由 Xcode 挑这台机器
	// UDID 对应的 "iOS Team Provisioning Profile"，过期或加新设备时自己重新签发。
	const development = process.env.IOS_SIGNING_STYLE === "development";
	const settings = development
		? ['CODE_SIGN_IDENTITY = "Apple Development";', `DEVELOPMENT_TEAM = ${team};`, "CODE_SIGN_STYLE = Automatic;"]
		: [
				'CODE_SIGN_IDENTITY = "iPhone Distribution";',
				`DEVELOPMENT_TEAM = ${team};`,
				"CODE_SIGN_STYLE = Manual;",
				`PROVISIONING_PROFILE_SPECIFIER = "${profile}";`,
			];
	source = source.replace(/CODE_SIGN_IDENTITY = "iPhone Developer";/g, settings.join("\n\t\t\t\t"));
	writeFileSync(projectFile, source);
	console.log(
		development
			? `prepare-ios: signing wired to team ${team}, automatic (development builds)`
			: `prepare-ios: signing wired to team ${team}, profile "${profile}"`,
	);
}

function applyExportCompliance() {
	// Standard HTTPS/TLS does not require non-exempt encryption documentation.
	try {
		execFileSync("/usr/bin/plutil", ["-replace", "ITSAppUsesNonExemptEncryption", "-bool", "false", infoPlist], {
			stdio: "ignore",
		});
	} catch {
		execFileSync("/usr/bin/plutil", ["-insert", "ITSAppUsesNonExemptEncryption", "-bool", "false", infoPlist]);
	}
}

function applyAppleFrameworks() {
	const project = readFileSync(projectFile, "utf8");
	const frameworks = ["UserNotifications", "EventKit", "Photos", "Vision"];
	const flags = frameworks.map((framework) => `"-framework", "${framework}"`).join(", ");
	const linked = project.includes('"UserNotifications"')
		? project.replace(/OTHER_LDFLAGS = \((.*)\);/g, (setting, existing) => {
				if (!existing.includes('"UserNotifications"')) return setting;
				const missing = frameworks.filter((framework) => !existing.includes(`"${framework}"`));
				if (!missing.length) return setting;
				return `OTHER_LDFLAGS = (${existing}, ${missing.map((name) => `"-framework", "${name}"`).join(", ")});`;
			})
		: project.replace(
				/^([\t ]*)CODE_SIGN_ENTITLEMENTS =/gm,
				(_line, indent) => `${indent}OTHER_LDFLAGS = ("$(inherited)", ${flags});\n${indent}CODE_SIGN_ENTITLEMENTS =`,
			);
	if (linked !== project) writeFileSync(projectFile, linked);
}

function applyNotifications() {
	const development = process.env.IOS_SIGNING_STYLE === "development";
	// Keep the existing release profile usable until it is renewed with the Push capability.
	const push = process.env.YONDER_IOS_PUSH ?? (development ? "1" : "0");
	if (push === "1") {
		execFileSync("/usr/bin/plutil", [
			"-replace",
			"aps-environment",
			"-string",
			development ? "development" : "production",
			entitlements,
		]);
		execFileSync("/usr/bin/plutil", [
			"-replace",
			"YonderPushEnvironment",
			"-string",
			development ? "sandbox" : "production",
			infoPlist,
		]);
	} else {
		for (const [key, path] of [
			["aps-environment", entitlements],
			["YonderPushEnvironment", infoPlist],
		]) {
			// A freshly generated project has neither key, and plutil exits 1 when asked to remove a missing one.
			try {
				execFileSync("/usr/bin/plutil", ["-extract", key, "raw", path], { stdio: "ignore" });
			} catch {
				continue;
			}
			execFileSync("/usr/bin/plutil", ["-remove", key, path], { stdio: "ignore" });
		}
	}
}

applyIcons();
applySigning();
applyExportCompliance();
applyAppleFrameworks();
applyNotifications();
// Tao's scene delegate keeps UIKit and WKWebView safe areas current after rotation.
execFileSync("/usr/bin/plutil", [
	"-replace",
	"UIApplicationSceneManifest",
	"-json",
	JSON.stringify({
		UIApplicationSupportsMultipleScenes: false,
		UISceneConfigurations: {
			UIWindowSceneSessionRoleApplication: [
				{ UISceneConfigurationName: "Default Configuration", UISceneDelegateClassName: "TaoSceneDelegate" },
			],
		},
	}),
	infoPlist,
]);
execFileSync("/usr/bin/plutil", [
	"-replace",
	"NSMicrophoneUsageDescription",
	"-string",
	"Record voice messages and meeting audio / 录制语音消息和会议音频",
	infoPlist,
]);
for (const key of ["NSCalendarsUsageDescription", "NSCalendarsFullAccessUsageDescription"]) {
	execFileSync("/usr/bin/plutil", [
		"-replace",
		key,
		"-string",
		"Allow your Agent to read calendar events when you use the Calendar connector / 允许智能体通过日历连接器读取日程",
		infoPlist,
	]);
}
execFileSync("/usr/bin/plutil", [
	"-replace",
	"PHPhotoLibraryPreventAutomaticLimitedAccessAlert",
	"-bool",
	"true",
	infoPlist,
]);
// The native meeting recorder owns capture when the WebView is suspended or the device locks.
const backgroundModes =
	JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", infoPlist], { encoding: "utf8" }))
		.UIBackgroundModes ?? [];
if (!backgroundModes.includes("audio")) backgroundModes.push("audio");
execFileSync("/usr/bin/plutil", ["-replace", "UIBackgroundModes", "-json", JSON.stringify(backgroundModes), infoPlist]);
