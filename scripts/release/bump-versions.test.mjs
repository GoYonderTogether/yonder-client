import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { bumpManifestText, changedManifests, workspacePaths } from "./bump-versions.mjs";

const MANIFEST = `{
\t"name": "@yonder/cloud",
\t"version": "0.3.26102802",
\t"dependencies": {
\t\t"@yonder/protocol": "0.3.26102802",
\t\t"typescript": "7.0.2"
\t},
\t"files": ["dist", "README.md"]
}
`;

test("只替换版本与内部 @yonder/* 依赖，保留排版", () => {
	const next = bumpManifestText(MANIFEST, "0.3.26102901");
	assert.equal(next, MANIFEST.replaceAll("0.3.26102802", "0.3.26102901"));
	assert.match(next, /"files": \["dist", "README\.md"\]/);
	assert.match(next, /"typescript": "7\.0\.2"/);
});

test("每个 workspace 都参与统一版本", () => {
	assert.deepEqual(workspacePaths({ workspaces: ["packages/protocol", "apps/web"] }), [
		"packages/protocol",
		"apps/web",
	]);
});

test("changedManifests 在临时仓库里只列出需要改的文件", (t) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "yonder-release-"));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const put = (name, contents) => {
		fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
		fs.writeFileSync(path.join(root, name), contents);
	};
	const rootManifest = JSON.stringify(
		{ name: "yonder", version: "0.3.26102802", workspaces: ["packages/protocol", "apps/web"] },
		null,
		"\t",
	);
	put("package.json", `${rootManifest}\n`);
	put("packages/protocol/package.json", '{"name":"@yonder/protocol","version":"0.3.26102901"}\n');
	put("apps/web/package.json", '{"name":"@yonder/web","version":"0.3.26102802"}\n');
	const changes = changedManifests(root, "0.3.26102901");
	assert.deepEqual(
		changes.map((change) => change.path),
		["package.json", "apps/web/package.json"],
	);
	assert.match(changes[0].contents, /"version": "0\.3\.26102901"/);
});
