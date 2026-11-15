import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const roots = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "yonder-direction-"));
	roots.push(root);
	const put = (path, contents) => {
		mkdirSync(join(root, path, ".."), { recursive: true });
		writeFileSync(join(root, path), contents);
	};
	put("packages/protocol/package.json", JSON.stringify({ name: "@yonder/protocol", version: "0.0.1" }));
	put("packages/protocol/src/index.ts", "export type A = { a: string };\n");
	put("apps/cloud/package.json", JSON.stringify({ name: "@yonder/cloud", version: "0.0.1" }));
	put("apps/cloud/src/index.ts", "export const x = 1;\n");
	return { root, put };
}

function run(root) {
	return execFileSync(process.execPath, [join(import.meta.dirname, "check-dependency-direction.mjs"), "--root", root], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

describe("check-dependency-direction", () => {
	test("passes for an app depending on a package", () => {
		const { root, put } = fixture();
		put(
			"apps/cloud/package.json",
			JSON.stringify({ name: "@yonder/cloud", version: "0.0.1", dependencies: { "@yonder/protocol": "0.0.1" } }),
		);
		put("apps/cloud/src/index.ts", 'import type { A } from "@yonder/protocol";\n');
		expect(run(root)).toMatch(/dependency-direction check passed/);
	});

	test("fails when a package depends on an app", () => {
		const { root, put } = fixture();
		put(
			"packages/protocol/package.json",
			JSON.stringify({ name: "@yonder/protocol", version: "0.0.1", dependencies: { "@yonder/cloud": "0.0.1" } }),
		);
		expect(() => run(root)).toThrow(/package may not depend on app/);
	});

	test("fails when a package imports an app", () => {
		const { root, put } = fixture();
		put("packages/protocol/src/index.ts", 'export { x } from "@yonder/cloud";\n');
		expect(() => run(root)).toThrow(/may not import app apps\/cloud/);
	});

	test("fails when protocol gains any dependency", () => {
		const { root, put } = fixture();
		put(
			"packages/protocol/package.json",
			JSON.stringify({ name: "@yonder/protocol", version: "0.0.1", devDependencies: { vitest: "1.0.0" } }),
		);
		expect(() => run(root)).toThrow(/must stay empty/);
	});

	test("fails when protocol imports a workspace package", () => {
		const { root, put } = fixture();
		put("packages/protocol/src/index.ts", 'import { x } from "@yonder/cloud";\n');
		expect(() => run(root)).toThrow(/protocol must not import/);
	});
});
