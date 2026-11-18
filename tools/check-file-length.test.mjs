import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { checkFileLength, countLines } from "./check-file-length.mjs";

const roots = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "yonder-file-length-"));
	roots.push(root);
	mkdirSync(join(root, "apps/web/src"), { recursive: true });
	return root;
}

const fileOf = (lines) => `${Array.from({ length: lines }, (_, index) => `// line ${index + 1}`).join("\n")}\n`;

function run(root, ...args) {
	return execFileSync(process.execPath, [join(import.meta.dirname, "check-file-length.mjs"), "--root", root, ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

/** Warnings go to stderr; return stdout and stderr together so a test can see either. */
function runWithOutput(root) {
	const result = spawnSync(process.execPath, [join(import.meta.dirname, "check-file-length.mjs"), "--root", root], {
		encoding: "utf8",
	});
	return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("countLines", () => {
	test("a trailing newline does not add a line", () => {
		expect(countLines("a\nb\n")).toBe(2);
		expect(countLines("a\nb")).toBe(2);
		expect(countLines("")).toBe(0);
	});
});

describe("check-file-length", () => {
	test("passes below the warning threshold", () => {
		const root = fixture();
		writeFileSync(join(root, "apps/web/src/short.ts"), fileOf(299));
		expect(checkFileLength(root)).toEqual({ warnings: [], failures: [] });
		expect(run(root)).toMatch(/file-length check passed/);
	});

	test("warns at 300 lines", () => {
		const root = fixture();
		writeFileSync(join(root, "apps/web/src/long.ts"), fileOf(300));
		expect(checkFileLength(root).warnings).toEqual([{ file: "apps/web/src/long.ts", lines: 300 }]);
		const { status, output } = runWithOutput(root);
		expect(status).toBe(0);
		expect(output).toMatch(/warning: apps\/web\/src\/long\.ts is 300 lines/);
	});

	test("fails at 500 lines", () => {
		const root = fixture();
		writeFileSync(join(root, "apps/web/src/too-long.ts"), fileOf(500));
		expect(checkFileLength(root).failures).toEqual([{ file: "apps/web/src/too-long.ts", lines: 500 }]);
		expect(() => run(root)).toThrow(/file-length check failed: 1 file\(s\) over 500 lines/);
	});

	test("skips build output, generated projects and vendored third-party code", () => {
		const root = fixture();
		for (const path of [
			"apps/web/dist/bundle.js",
			"apps/desktop/src-tauri/gen/App.ts",
			"apps/web/node_modules/x.js",
			"packages/ui/components/src/ambient/vendor/shader.tsx",
		]) {
			mkdirSync(join(root, path, ".."), { recursive: true });
			writeFileSync(join(root, path), fileOf(900));
		}
		expect(checkFileLength(root)).toEqual({ warnings: [], failures: [] });
	});
});
