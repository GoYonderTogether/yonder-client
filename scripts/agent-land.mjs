#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const mainRef = "refs/heads/main";
const trackingRef = "refs/remotes/origin/main";

function run(command, args, cwd, inherit = false) {
	const child = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
	});
	if (child.error) throw child.error;
	if (child.status !== 0)
		throw new Error(child.stderr?.trim() || `${command} ${args.join(" ")} exited with ${child.signal || child.status}`);
	return child.stdout?.trim() ?? "";
}

function git(cwd, ...args) {
	return run("git", ["-C", cwd, ...args], cwd);
}

function requireClean(cwd, label) {
	if (git(cwd, "status", "--porcelain", "--untracked-files=all", "--ignore-submodules=none")) {
		throw new Error(`${label} is dirty; commit or remove its changes before landing`);
	}
}

function taskHead(cwd, branch) {
	if (git(cwd, "symbolic-ref", "--short", "HEAD") !== branch) throw new Error("Task branch changed while landing");
	requireClean(cwd, "Task worktree");
	return git(cwd, "rev-parse", "HEAD");
}

async function acquireLock(lock) {
	const deadline = Date.now() + 15 * 60 * 1000;
	let notified = false;
	for (;;) {
		try {
			mkdirSync(lock);
			return;
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
			let owner = "unknown";
			try {
				owner = readFileSync(join(lock, "pid"), "utf8").trim();
			} catch {}
			if (Date.now() >= deadline) {
				throw new Error(
					`Integration timed out behind PID ${owner}: ${lock}. Remove a stale lock only after verifying no integration is active.`,
				);
			}
			if (!notified) {
				console.error(`Waiting for integration lock (PID ${owner}): ${lock}`);
				notified = true;
			}
			await delay(500);
		}
	}
}

async function land(check) {
	const cwd = git(process.cwd(), "rev-parse", "--show-toplevel");
	const envOverrides = git(cwd, "rev-parse", "--local-env-vars")
		.split("\n")
		.filter((name) => process.env[name] !== undefined);
	if (envOverrides.length) throw new Error(`Unset Git repository overrides first: ${envOverrides.join(", ")}`);
	const common = git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir");
	const gitDir = git(cwd, "rev-parse", "--absolute-git-dir");
	if (resolve(common) === resolve(gitDir)) throw new Error("Run from a linked task worktree, not the primary checkout");

	const branch = git(cwd, "symbolic-ref", "--short", "HEAD");
	if (branch === "main") throw new Error("Run from a local task branch, not main");
	const original = taskHead(cwd, branch);

	const lock = join(common, "agent-land.lock");
	await acquireLock(lock);

	let scratchRoot;
	let candidate;
	let registered = false;
	try {
		writeFileSync(join(lock, "pid"), `${process.pid}\n`);
		if (taskHead(cwd, branch) !== original) throw new Error("Task commit changed before integration");
		if (git(cwd, "remote", "get-url", "--push", "--all", "origin").split("\n").length !== 1) {
			throw new Error("origin must have exactly one push destination");
		}
		git(cwd, "fetch", "--no-tags", "--recurse-submodules=no", "origin", `${mainRef}:${trackingRef}`);
		const base = git(cwd, "rev-parse", trackingRef);
		const unique = git(cwd, "rev-list", `${base}..${original}`);
		const parents = git(cwd, "rev-list", "--parents", "-n", "1", original).split(" ");
		if (unique !== original || parents.length !== 2) {
			throw new Error("The task branch must contain exactly one non-merge commit not on origin/main");
		}

		scratchRoot = mkdtempSync(join(tmpdir(), "yonder-agent-land-"));
		candidate = join(scratchRoot, "candidate");
		git(cwd, "worktree", "add", "--quiet", "--detach", candidate, base);
		registered = true;
		try {
			git(candidate, "cherry-pick", original);
		} catch (error) {
			throw new Error(
				`Could not apply ${original} to ${base}; nothing pushed. Resolve in the task worktree and recommit before retrying.\n${error.message}`,
			);
		}
		const verified = git(candidate, "rev-parse", "HEAD");
		requireClean(candidate, "Candidate");
		console.log(`Checking candidate ${verified} in ${candidate}`);
		run(check[0], check.slice(1), candidate, true);
		requireClean(candidate, "Candidate after check");
		if (git(candidate, "rev-parse", "HEAD") !== verified)
			throw new Error("Check changed the candidate commit; nothing pushed");
		if (taskHead(cwd, branch) !== original) throw new Error("Task commit changed while checking; nothing pushed");

		const [remote] = git(cwd, "ls-remote", "--exit-code", "origin", mainRef).split(/\s+/);
		if (remote !== base)
			throw new Error("origin/main advanced during integration; retry to check against the new base");
		run(
			"git",
			["-C", candidate, "push", "--no-follow-tags", "--recurse-submodules=no", "origin", `${verified}:${mainRef}`],
			candidate,
			true,
		);
		console.log(`Landed ${verified} on origin/main (task commit ${original})`);
	} finally {
		try {
			if (registered) git(cwd, "worktree", "remove", "--force", candidate);
			if (scratchRoot) rmSync(scratchRoot, { recursive: true, force: true });
		} catch (error) {
			console.error(`Scratch cleanup failed; inspect ${candidate}: ${error.message}`);
		} finally {
			rmSync(join(lock, "pid"), { force: true });
			rmdirSync(lock);
		}
	}
}

try {
	const [separator, ...check] = process.argv.slice(2);
	if (separator !== "--" || !check.length)
		throw new Error("Usage: node scripts/agent-land.mjs -- <check-command> [args...]");
	await land(check);
} catch (error) {
	console.error(`agent-land: ${error.message}`);
	process.exitCode = 1;
}
