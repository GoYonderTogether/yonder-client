import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("iOS preparation writes export compliance to the project's plist", { skip: process.platform !== "darwin" }, () => {
	const root = mkdtempSync(join(tmpdir(), "yonder-ios-"));
	try {
		const desktop = join(root, "apps/desktop");
		const apple = join(desktop, "src-tauri/gen/apple");
		mkdirSync(join(apple, "yonder-desktop.xcodeproj"), { recursive: true });
		mkdirSync(join(apple, "yonder-desktop_iOS"), { recursive: true });
		cpSync(resolve("apps/desktop/prepare-ios.mjs"), join(desktop, "prepare-ios.mjs"));
		writeFileSync(
			join(apple, "yonder-desktop.xcodeproj/project.pbxproj"),
			'INFOPLIST_FILE = "yonder-desktop_iOS/Info.plist"; DEVELOPMENT_TEAM = team;',
		);
		const plist = join(apple, "yonder-desktop_iOS/Info.plist");
		writeFileSync(plist, '<?xml version="1.0"?><plist version="1.0"><dict/></plist>');
		const run = () => execFileSync(process.execPath, [join(desktop, "prepare-ios.mjs")]);
		const value = () =>
			execFileSync("/usr/bin/plutil", ["-extract", "ITSAppUsesNonExemptEncryption", "raw", plist], {
				encoding: "utf8",
			}).trim();
		run();
		assert.equal(value(), "false");
		execFileSync("/usr/bin/plutil", ["-replace", "ITSAppUsesNonExemptEncryption", "-bool", "true", plist]);
		run();
		assert.equal(value(), "false");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
