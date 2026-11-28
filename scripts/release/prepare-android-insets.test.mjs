import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

test("Android preparation restores launcher branding, camera permission, and native insets after regeneration", () => {
	const root = mkdtempSync(join(tmpdir(), "yonder-android-insets-"));
	try {
		const desktop = join(root, "apps/desktop");
		const android = join(desktop, "src-tauri/gen/android");
		const activity = join(android, "app/src/main/java/net/yonderbot/app/MainActivity.kt");
		const resources = join(android, "app/src/main/res");
		const launcher = join(desktop, "src-tauri/icons/android");
		const bitmaps = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"].flatMap((density) =>
			["ic_launcher", "ic_launcher_round", "ic_launcher_foreground"].map((name) => `mipmap-${density}/${name}.png`),
		);
		for (const bitmap of bitmaps) {
			const path = join(resources, bitmap);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, "template launcher");
		}
		const drawable = join(resources, "drawable-v24/ic_launcher_foreground.xml");
		mkdirSync(dirname(drawable), { recursive: true });
		writeFileSync(drawable, "<vector />");
		mkdirSync(join(android, "app/src/main/java/net/yonderbot/app"), { recursive: true });
		mkdirSync(join(resources, "xml"), { recursive: true });
		writeFileSync(join(resources, "xml/file_paths.xml"), '<paths><cache-path name="cache" path="."/></paths>');
		cpSync(resolve("apps/desktop/prepare-android.mjs"), join(desktop, "prepare-android.mjs"));
		cpSync(resolve("apps/desktop/android"), join(desktop, "android"), { recursive: true });
		cpSync(resolve("apps/desktop/src-tauri/icons/android"), launcher, { recursive: true });
		writeFileSync(join(android, "app/build.gradle.kts"), "android {}\n");
		writeFileSync(join(android, "build.gradle.kts"), "allprojects {}\n");
		const manifest = join(android, "app/src/main/AndroidManifest.xml");
		writeFileSync(
			manifest,
			'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:icon="@mipmap/ic_launcher"><activity android:name=".MainActivity"/><provider android:authorities="' +
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
		assert.match(first, /document\.documentElement\.dataset\.nativeKeyboard = '\$\{ime > 0\}'/);
		assert.match(first, /native-insets-change/);
		assert.match(first, /\.setInsets\(WindowInsetsCompat\.Type\.ime\(\), Insets\.NONE\)/);
		assert.doesNotMatch(first, /maxOf\(bars\.bottom, ime\)/);
		const firstManifest = readFileSync(manifest, "utf8");
		assert.equal(firstManifest.match(/android\.permission\.CAMERA/g)?.length, 1);
		assert.match(firstManifest, /<application\b[^>]*\sandroid:icon="@mipmap\/ic_launcher"/);
		assert.match(firstManifest, /<application\b[^>]*\sandroid:roundIcon="@mipmap\/ic_launcher_round"/);
		const adaptive = "mipmap-anydpi-v26/ic_launcher.xml";
		const background = "values/ic_launcher_background.xml";
		const assertLauncherResources = () => {
			for (const path of [...bitmaps, adaptive, background]) {
				assert.deepEqual(readFileSync(join(resources, path)), readFileSync(join(launcher, path)), path);
			}
			assert.deepEqual(
				readFileSync(join(resources, "mipmap-anydpi-v26/ic_launcher_round.xml")),
				readFileSync(join(launcher, adaptive)),
			);
			assert.match(readFileSync(join(resources, background), "utf8"), /name="ic_launcher_background">#FFFFFF</);
			assert.equal(readFileSync(drawable, "utf8"), "<vector />");
		};
		assertLauncherResources();
		run();
		assert.equal(readFileSync(activity, "utf8"), first);
		assert.equal(readFileSync(manifest, "utf8"), firstManifest);
		assertLauncherResources();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
