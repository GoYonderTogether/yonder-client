// apps/desktop is not an npm workspace (it carries its own Tauri CLI dependency), so
// bump-versions.mjs does not touch it. Keep its three version fields in step with the release.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Files that carry the desktop version, with the exact text each one uses. */
export const VERSION_FILES = [
	{ path: "apps/desktop/package.json", pattern: /("version"\s*:\s*)"[^"]*"/ },
	{ path: "apps/desktop/src-tauri/tauri.conf.json", pattern: /("version"\s*:\s*)"[^"]*"/ },
	{ path: "apps/desktop/src-tauri/Cargo.toml", pattern: /^(version\s*=\s*)"[^"]*"/m },
];

/** Apply the version to one file's text, replacing the first match only. */
export function bumpDesktopText(text, version, pattern) {
	return text.replace(pattern, `$1"${version}"`);
}

export function changedDesktopFiles(rootDir, version) {
	const changes = [];
	for (const file of VERSION_FILES) {
		const before = readFileSync(join(rootDir, file.path), "utf8");
		const after = bumpDesktopText(before, version, file.pattern);
		if (before !== after) changes.push({ path: file.path, contents: after });
	}
	return changes;
}

function main(argv) {
	const index = argv.indexOf("--version");
	const version = index === -1 ? undefined : argv[index + 1];
	if (!version || !/^0\.\d+\.\d{8}$/.test(version)) {
		console.error("用法：sync-desktop-version.mjs --version 0.<minor>.<YYMMDDNN>");
		return 2;
	}
	for (const change of changedDesktopFiles(ROOT, version)) {
		writeFileSync(join(ROOT, change.path), change.contents);
		console.log(`已修改 ${change.path} → ${version}`);
	}
	return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	process.exitCode = main(process.argv.slice(2));
}
