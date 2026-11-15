import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("Android preparation restores camera permission and native safe/keyboard insets after regeneration", () => {
	const root = mkdtempSync(join(tmpdir(), "yonder-android-insets-"));
	try {
		const desktop = join(root, "apps/desktop");
		const android = join(desktop, "src-tauri/gen/android");
		const activity = join(android, "app/src/main/java/net/yonderbot/app/MainActivity.kt");
		mkdirSync(join(android, "app/src/main/java/net/yonderbot/app"), { recursive: true });
		mkdirSync(join(android, "app/src/main/res/xml"), { recursive: true });
		writeFileSync(
			join(android, "app/src/main/res/xml/file_paths.xml"),
			'<paths><cache-path name="cache" path="."/></paths>',
		);
		cpSync(resolve("apps/desktop/prepare-android.mjs"), join(desktop, "prepare-android.mjs"));
		cpSync(resolve("apps/desktop/android"), join(desktop, "android"), { recursive: true });
		writeFileSync(join(android, "app/build.gradle.kts"), "android {}\n");
		writeFileSync(join(android, "build.gradle.kts"), "allprojects {}\n");
		const manifest = join(android, "app/src/main/AndroidManifest.xml");
		writeFileSync(
			manifest,
			'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><activity android:name=".MainActivity"/><provider android:authorities="' +
				"$" +
				'{applicationId}.fileprovider" /></application></manifest>',
		);
		writeFileSync(activity, "package net.yonderbot.app\nclass MainActivity : TauriActivity() {}\n");
		const run = () =>
			execFileSync(process.execPath, [
				join(desktop, "prepare-android.mjs"),
				"--no-mirrors",
				"--keystore",
				join(root, "absent.jks"),
			]);
		run();
		const first = readFileSync(activity, "utf8");
		assert.match(first, /WindowInsetsCompat\.Type\.systemBars\(\) or WindowInsetsCompat\.Type\.displayCutout\(\)/);
		assert.match(first, /view\.setPadding\(0, 0, 0, ime\)/);
		assert.match(first, /@JavascriptInterface fun getInsets\(\): String = safeInsets/);
		assert.match(first, /put\("top", bars\.top \/ density\)/);
		assert.match(first, /put\("bottom", if \(ime > 0\) 0f else bars\.bottom \/ density\)/);
		assert.match(first, /native-insets-change/);
		assert.match(first, /\.setInsets\(WindowInsetsCompat\.Type\.ime\(\), Insets\.NONE\)/);
		assert.doesNotMatch(first, /maxOf\(bars\.bottom, ime\)/);
		assert.match(readFileSync(manifest, "utf8"), /android\.permission\.CAMERA/);
		run();
		assert.equal(readFileSync(activity, "utf8"), first);
		assert.equal(readFileSync(manifest, "utf8").match(/android\.permission\.CAMERA/g)?.length, 1);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
