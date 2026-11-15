import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateCheckRuns, REQUIRED_CHECKS } from "./ci-status.mjs";

const run = (id, name, status, conclusion = null) => ({ id, name, status, conclusion });

test("the aggregate CI check gates a release", () => {
	assert.deepEqual(REQUIRED_CHECKS, ["CI"]);
	assert.equal(evaluateCheckRuns({ check_runs: [run(1, "CI", "completed", "success")] }).state, "pass");
});

test("still waiting while the aggregate check has not finished", () => {
	const result = evaluateCheckRuns({ check_runs: [run(1, "CI", "in_progress")] });
	assert.equal(result.state, "pending");
	assert.match(result.message, /CI=in_progress/);
});

test("a missing aggregate check is not a pass", () => {
	assert.equal(evaluateCheckRuns({ check_runs: [] }).state, "pending");
	assert.equal(evaluateCheckRuns({}).state, "pending");
});

test("the release job's own check-run does not count", () => {
	const result = evaluateCheckRuns({
		check_runs: [run(1, "CI", "completed", "success"), run(2, "Tag, CHANGELOG and GitHub Release", "in_progress")],
	});
	assert.equal(result.state, "pass");
});

test("a re-run replaces the older attempt of the same check", () => {
	const result = evaluateCheckRuns({
		check_runs: [run(5, "CI", "completed", "success"), run(1, "CI", "completed", "failure")],
	});
	assert.equal(result.state, "pass");
});

for (const conclusion of ["failure", "cancelled", "timed_out", "skipped", "neutral", null]) {
	test(`a release is refused when CI ends as ${conclusion}`, () => {
		assert.equal(evaluateCheckRuns({ check_runs: [run(1, "CI", "completed", conclusion)] }).state, "fail");
	});
}
