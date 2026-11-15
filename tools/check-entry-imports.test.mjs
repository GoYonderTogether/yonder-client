import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const roots = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A throwaway repo with two workspace packages and one app. */
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "yonder-entry-imports-"));
	roots.push(root);
	const put = (path, contents) => {
		mkdirSync(join(root, path, ".."), { recursive: true });
		writeFileSync(join(root, path), contents);
	};
	put("packages/protocol/package.json", JSON.stringify({ name: "@yonder/protocol", version: "0.0.1" }));
	put("packages/protocol/src/index.ts", "export type A = { a: string };\n");
	put("packages/protocol/src/version/payload.ts", "export type B = { b: string };\n");
	put("apps/cloud/package.json", JSON.stringify({ name: "@yonder/cloud", version: "0.0.1" }));
	return { root, put };
}

function run(root) {
	return execFileSync(process.execPath, [join(import.meta.dirname, "check-entry-imports.mjs"), "--root", root], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

describe("check-entry-imports", () => {
	test("passes when a package is imported through its entry", () => {
		const { root, put } = fixture();
		put("apps/cloud/src/ok.ts", 'import type { A } from "@yonder/protocol";\n');
		expect(run(root)).toMatch(/entry-import check passed/);
	});

	test("fails on a bare specifier into the package's source", () => {
		const { root, put } = fixture();
		put("apps/cloud/src/bad.ts", 'import type { B } from "@yonder/protocol/src/version/payload.ts";\n');
		expect(() => run(root)).toThrow(/must be imported through its entry/);
	});

	test("fails on a relative path into another package", () => {
		const { root, put } = fixture();
		put("apps/cloud/src/bad.ts", 'import type { B } from "../../../packages/protocol/src/version/payload.ts";\n');
		expect(() => run(root)).toThrow(/relative path into packages\/protocol/);
	});

	test("allows a package to import its own files relatively", () => {
		const { root, put } = fixture();
		put("packages/protocol/src/index.ts", 'export type { B } from "./version/payload.ts";\n');
		expect(run(root)).toMatch(/entry-import check passed/);
	});

	test("fails on a dynamic import past the entry", () => {
		const { root, put } = fixture();
		put("apps/cloud/src/bad.ts", 'await import("@yonder/protocol/src/index.ts");\n');
		expect(() => run(root)).toThrow(/must be imported through its entry/);
	});
});
