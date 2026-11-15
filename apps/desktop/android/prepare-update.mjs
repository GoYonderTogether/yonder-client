import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function updateManifest(source) {
	let result = source;
	if (!result.includes("$" + "{applicationId}.fileprovider")) {
		throw new Error("AndroidManifest.xml has no Tauri FileProvider");
	}
	if (!result.includes("android.permission.REQUEST_INSTALL_PACKAGES")) {
		if (!result.includes("<application")) throw new Error("AndroidManifest.xml has no application");
		result = result.replace(
			"<application",
			'<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n    <application',
		);
	}
	return result;
}

export function prepareAndroidUpdate(android, source) {
	const main = join(android, "app/src/main");
	const manifest = join(main, "AndroidManifest.xml");
	writeFileSync(manifest, updateManifest(readFileSync(manifest, "utf8")));
	const java = join(main, "java/net/yonderbot/app");
	const paths = readFileSync(join(main, "res/xml/file_paths.xml"), "utf8");
	if (!/<cache-path\b[^>]*\bpath="\."/.test(paths)) throw new Error("Tauri FileProvider has no cache path");
	mkdirSync(java, { recursive: true });
	copyFileSync(join(source, "UpdatePlugin.kt"), join(java, "UpdatePlugin.kt"));
}
