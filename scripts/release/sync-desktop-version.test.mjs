import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { bumpDesktopText, changedDesktopFiles, VERSION_FILES } from "./sync-desktop-version.mjs";

const [PACKAGE, TAURI, CARGO] = VERSION_FILES;

test("package.json 与 tauri.conf.json 只换 version 值", () => {
	const manifest = '{\n\t"name": "@yonder/desktop",\n\t"version": "0.3.26111201"\n}\n';
	assert.match(bumpDesktopText(manifest, "0.3.26111301", PACKAGE.pattern), /"version": "0\.3\.26111301"/);
	assert.match(bumpDesktopText(manifest, "0.3.26111301", PACKAGE.pattern), /"name": "@yonder\/desktop"/);

	const tauri = '{\n\t"productName": "Yonder",\n\t"version": "0.3.26111201"\n}\n';
	assert.match(bumpDesktopText(tauri, "0.3.26111301", TAURI.pattern), /"version": "0\.3\.26111301"/);
});

test("Cargo.toml 只改 package 段的 version", () => {
	const cargo = '[package]\nname = "yonder-desktop"\nversion = "0.3.26111201"\n\n[dependencies]\ntauri = "=2.12.5"\n';
	const next = bumpDesktopText(cargo, "0.3.26111301", CARGO.pattern);
	assert.match(next, /^version = "0\.3\.26111301"$/m);
	assert.match(next, /tauri = "=2\.12\.5"/);
});

test("changedDesktopFiles 在临时目录里逐个文件写出版本", (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "yonder-desktop-version-"));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const put = (name, contents) => {
		fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
		fs.writeFileSync(path.join(root, name), contents);
	};
	put("apps/desktop/package.json", '{"version":"0.3.26111201"}\n');
	put("apps/desktop/src-tauri/tauri.conf.json", '{"version":"0.3.26111201"}\n');
	put("apps/desktop/src-tauri/Cargo.toml", '[package]\nversion = "0.3.26111201"\n');
	const changes = changedDesktopFiles(root, "0.3.26111301");
	assert.deepEqual(
		changes.map((change) => change.path),
		["apps/desktop/package.json", "apps/desktop/src-tauri/tauri.conf.json", "apps/desktop/src-tauri/Cargo.toml"],
	);
	for (const change of changes) assert.match(change.contents, /0\.3\.26111301/);
});

test("版本已经一致时不产生改动", (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "yonder-desktop-version-"));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	for (const file of VERSION_FILES) {
		fs.mkdirSync(path.dirname(path.join(root, file.path)), { recursive: true });
		fs.writeFileSync(path.join(root, file.path), '{"version":"0.3.26111201"}\nversion = "0.3.26111201"\n');
	}
	assert.deepEqual(changedDesktopFiles(root, "0.3.26111201"), []);
});
