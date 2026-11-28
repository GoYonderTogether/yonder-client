import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { devNull } from "node:os";
import test from "node:test";

const workflow = readFileSync(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8");
const version = "0.3.26112412";
const sha = "a".repeat(40);
const step = (name) => {
	const start = workflow.indexOf(`      - name: ${name}\n`);
	assert.notEqual(start, -1);
	return workflow.slice(start).split("\n      - name: ")[0];
};

test("an ordinary release stays a prerelease, and Android-only skips Web publication", () => {
	assert.match(workflow, / {6}android_only:\n[^\n]+\n {8}required: false\n {8}default: false\n {8}type: boolean/);
	assert.match(step("Dispatch beta web deployment"), / {8}if: \$\{\{ !inputs\.android_only \}\}/);
	const publish = step("公开 Release");
	assert.match(publish, /gh release edit "v\$VERSION" --draft=false --prerelease --latest=false/);
	assert.match(publish, /GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
});

for (const androidOnly of ["true", "false"]) {
	test(`release routing with android_only=${androidOnly}`, { skip: process.platform === "win32" }, () => {
		const run = step("派发安卓 APK、iOS TestFlight 与桌面安装包构建")
			.split("        run: |\n")[1]
			?.split("\n        env:")[0];
		assert.ok(run);
		const calls = execFileSync(
			"/bin/bash",
			["-e", "-c", `gh() { printf '%s\\n' "$*"; }\ngit() { echo "${sha}"; }\n${run}`],
			{
				encoding: "utf8",
				env: { VERSION: version, ANDROID_ONLY: androidOnly, GITHUB_STEP_SUMMARY: devNull },
			},
		)
			.trim()
			.split("\n");
		const dispatch = (platform, ref = `v${version}`) =>
			`workflow run ${platform}-release.yml --ref ${ref} -f version=${version} -f expected_commit=${sha}`;
		assert.deepEqual(
			calls,
			androidOnly === "true"
				? [dispatch("android")]
				: [dispatch("android"), dispatch("desktop", "main"), dispatch("ios")],
		);
	});
}
