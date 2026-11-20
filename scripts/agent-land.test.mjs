import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("./agent-land.mjs", import.meta.url));
const env = {
	...process.env,
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
};

function git(cwd, ...args) {
	const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", env });
	assert.equal(result.status, 0, result.stderr);
	return result.stdout.trim();
}

function commit(cwd, file, value, message) {
	writeFileSync(join(cwd, file), value);
	git(cwd, "add", "--", file);
	git(cwd, "commit", "-m", message);
	return git(cwd, "rev-parse", "HEAD");
}

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), "agent-land-test-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const primary = join(root, "primary");
	const remote = join(root, "remote.git");
	git(root, "init", "--bare", "--initial-branch=main", remote);
	git(root, "init", "--initial-branch=main", primary);
	git(primary, "config", "user.email", "queue@example.invalid");
	git(primary, "config", "user.name", "Queue Fixture");
	git(primary, "remote", "add", "origin", remote);
	const base = commit(primary, "shared.txt", "base", "base");
	git(primary, "push", "-u", "origin", "main");
	const remoteHead = () => git(remote, "rev-parse", "refs/heads/main");
	function task(name, file = "shared.txt") {
		const cwd = join(root, name);
		git(primary, "worktree", "add", "-b", name, cwd, base);
		const sha = commit(cwd, file, name, name);
		return { cwd, sha };
	}
	function outside(file, value = "next") {
		const cwd = join(root, "outside");
		git(root, "clone", remote, cwd);
		git(cwd, "config", "user.email", "outside@example.invalid");
		git(cwd, "config", "user.name", "Outside Fixture");
		const sha = commit(cwd, file, value, "outside");
		git(cwd, "push", "origin", "main");
		return sha;
	}
	function restored(task) {
		assert.equal(git(task.cwd, "rev-parse", "HEAD"), task.sha);
		assert.equal(git(task.cwd, "status", "--porcelain"), "");
		assert.equal(git(primary, "rev-parse", "HEAD"), base);
		assert.match(git(primary, "status", "--porcelain"), /^\?\? owner\.txt$/);
		assert.equal(readFileSync(join(primary, "owner.txt"), "utf8"), "owner's uncommitted work");
		assert.doesNotMatch(git(primary, "worktree", "list", "--porcelain"), /yonder-agent-land-/);
		assert.equal(existsSync(join(primary, ".git", "agent-land.lock")), false);
	}
	writeFileSync(join(primary, "owner.txt"), "owner's uncommitted work");
	return { root, primary, remote, base, task, outside, remoteHead, restored };
}

function land(cwd, ...gate) {
	return spawnSync(process.execPath, [cli, "--", process.execPath, ...gate], { cwd, encoding: "utf8", env });
}

function waitForFile(path) {
	return (async () => {
		for (let i = 0; i < 200; i++) {
			if (existsSync(path)) return;
			await delay(25);
		}
		throw new Error(`Gate never reached ${path}`);
	})();
}

async function holdGate(t, cwd, root) {
	const ready = join(root, "gate-ready");
	const go = join(root, "gate-go");
	const gate = join(root, "gate.cjs");
	writeFileSync(
		gate,
		'const fs = require("node:fs"); fs.writeFileSync(process.argv[2], "ready"); const timer = setInterval(() => { if (fs.existsSync(process.argv[3])) clearInterval(timer); }, 25); setTimeout(() => { if (!fs.existsSync(process.argv[3])) process.exit(50); }, 8000).unref();',
	);
	const child = spawn(process.execPath, [cli, "--", process.execPath, gate, ready, go], {
		cwd,
		env,
		stdio: ["ignore", "pipe", "pipe"],
	});
	let stderr = "";
	child.stderr.on("data", (buffer) => {
		stderr += buffer;
	});
	const closed = new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (status) => resolve({ status, stderr }));
	});
	t.after(async () => {
		if (existsSync(root) && !existsSync(go)) writeFileSync(go, "go");
		await closed;
	});
	await waitForFile(ready);
	return async () => {
		writeFileSync(go, "go");
		return closed;
	};
}

test("lands the exact checked tree on the fetched main without switching or changing either checkout", (t) => {
	const f = fixture(t);
	const task = f.task("task");
	const advanced = f.outside("new.txt");
	git(f.primary, "config", "push.followTags", "true");
	git(f.primary, "tag", "-a", "local-only", "-m", "do not publish", f.base);
	const proof = join(f.root, "verified");
	const gate = [
		'const { execFileSync } = require("node:child_process"); const fs = require("node:fs");',
		'if (fs.readFileSync("shared.txt", "utf8") !== "task" || fs.readFileSync("new.txt", "utf8") !== "next") process.exit(3);',
		'fs.writeFileSync(process.argv[1], execFileSync("git", ["rev-parse", "HEAD"]));',
	].join(" ");
	const result = land(task.cwd, "-e", gate, proof);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(f.remoteHead(), readFileSync(proof, "utf8").trim());
	assert.equal(git(f.remote, "rev-parse", "HEAD^"), advanced);
	assert.equal(git(f.remote, "tag", "--list"), "");
	f.restored(task);
});

test("a conflict leaves both original branches intact and does not run checks", (t) => {
	const f = fixture(t);
	const task = f.task("task");
	const advanced = f.outside("shared.txt");
	const result = land(task.cwd, "-e", "process.exit(99)");
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Could not apply/);
	assert.doesNotMatch(result.stderr, /exited with 99/);
	assert.equal(f.remoteHead(), advanced);
	f.restored(task);
});

test("a failed or mutating gate refuses push and cleans only its scratch checkout", (t) => {
	const f = fixture(t);
	const task = f.task("task");
	const failed = land(task.cwd, "-e", "process.exit(12)");
	assert.equal(failed.status, 1);
	assert.match(failed.stderr, /exited with 12/);
	assert.equal(f.remoteHead(), f.base);
	f.restored(task);
	const mutated = land(task.cwd, "-e", 'require("node:fs").writeFileSync("shared.txt", "not tested");');
	assert.equal(mutated.status, 1);
	assert.match(mutated.stderr, /Candidate after check is dirty/);
	assert.equal(f.remoteHead(), f.base);
	f.restored(task);
});

test("queues separate linked worktrees under one lock and safely lands both", async (t) => {
	const f = fixture(t);
	const task = f.task("first");
	const other = f.task("second", "other.txt");
	const resume = await holdGate(t, task.cwd, f.root);
	const waiting = join(f.root, "second-waiting");
	const child = spawn(
		process.execPath,
		[
			cli,
			"--",
			process.execPath,
			"-e",
			'if (require("node:fs").readFileSync("shared.txt", "utf8") !== "first") process.exit(9);',
		],
		{ cwd: other.cwd, env, stdio: ["ignore", "pipe", "pipe"] },
	);
	let stderr = "";
	child.stderr.on("data", (buffer) => {
		stderr += buffer;
		if (stderr.includes("Waiting for integration lock")) writeFileSync(waiting, "waiting");
	});
	const closed = new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (status) => resolve({ status, stderr }));
	});
	await waitForFile(waiting);
	assert.equal(f.remoteHead(), f.base);
	const result = await resume();
	assert.equal(result.status, 0, result.stderr);
	const next = await closed;
	assert.equal(next.status, 0, next.stderr);
	assert.equal(git(f.remote, "show", "main:shared.txt"), "first");
	assert.equal(git(f.remote, "show", "main:other.txt"), "second");
	assert.equal(git(f.remote, "rev-list", "--count", `${f.base}..main`), "2");
	f.restored(task);
	assert.equal(git(other.cwd, "rev-parse", "HEAD"), other.sha);
	assert.equal(git(other.cwd, "status", "--porcelain"), "");
});

test("an external advance during the gate is never overwritten", async (t) => {
	const f = fixture(t);
	const task = f.task("task");
	const resume = await holdGate(t, task.cwd, f.root);
	const advanced = f.outside("outside.txt");
	const result = await resume();
	assert.equal(result.status, 1);
	assert.match(result.stderr, /origin\/main advanced during integration/);
	assert.equal(f.remoteHead(), advanced);
	f.restored(task);
});

test("refuses a dirty task, multiple commits, primary checkout, or missing gate", (t) => {
	const f = fixture(t);
	const task = f.task("task");
	assert.match(land(f.primary, "-e", "0").stderr, /linked task worktree/);
	const noGate = spawnSync(process.execPath, [cli], { cwd: task.cwd, env, encoding: "utf8" });
	assert.equal(noGate.status, 1);
	assert.match(noGate.stderr, /Usage:/);
	writeFileSync(join(task.cwd, "unfinished.txt"), "don't touch");
	const dirty = land(task.cwd, "-e", "0");
	assert.equal(dirty.status, 1);
	assert.match(dirty.stderr, /Task worktree is dirty/);
	assert.equal(readFileSync(join(task.cwd, "unfinished.txt"), "utf8"), "don't touch");
	assert.equal(git(task.cwd, "rev-parse", "HEAD"), task.sha);
	const second = commit(task.cwd, "unfinished.txt", "second commit", "second commit");
	const extra = land(task.cwd, "-e", "0");
	assert.equal(extra.status, 1);
	assert.match(extra.stderr, /exactly one non-merge commit/);
	assert.equal(f.remoteHead(), f.base);
	f.restored({ cwd: task.cwd, sha: second });
});
