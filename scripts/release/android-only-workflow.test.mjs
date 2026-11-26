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

test("Android-only dispatch is opt-in and skips Web publication", () => {
	assert.match(workflow, / {6}android_only:\n[^\n]+\n {8}required: false\n {8}default: false\n {8}type: boolean/);
	assert.match(step("Dispatch official web deployment"), / {8}if: \$\{\{ !inputs\.android_only \}\}/);
	const publish = step("公开 Release");
	assert.match(publish, /GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
});

for (const androidOnly of ["true", "false"]) {
	test(`release routing with android_only=${androidOnly}`, { skip: process.platform === "win32" }, () => {
		const scripts = ["公开 Release", "派发安卓 APK、iOS TestFlight 与桌面安装包构建"].map((name) => {
			const run = step(name).split("        run: |\n")[1]?.split("\n        env:")[0];
			assert.ok(run);
			return run;
		});
		const calls = execFileSync(
			"/bin/bash",
			["-e", "-c", `gh() { printf '%s\\n' "$*"; }\ngit() { echo "${sha}"; }\n${scripts.join("\n")}`],
			{
				encoding: "utf8",
				env: { VERSION: version, ANDROID_ONLY: androidOnly, GITHUB_STEP_SUMMARY: devNull },
			},
		)
			.trim()
			.split("\n");
		// iOS ships as a TestFlight internal build, so its dispatch carries the audience flag;
		// without it Apple marks the build APP_STORE_ELIGIBLE and no tester can install it.
		const dispatch = (platform) =>
			`workflow run ${platform}-release.yml --ref v${version} -f version=${version} -f expected_commit=${sha}${
				platform === "ios" ? " -f testflight_internal=true" : ""
			}`;
		assert.deepEqual(
			calls,
			androidOnly === "true"
				? [`release edit v${version} --draft=false --latest=false`, dispatch("android")]
				: [
						`release edit v${version} --draft=false --latest`,
						dispatch("android"),
						dispatch("desktop"),
						dispatch("ios"),
					],
		);
	});
}
