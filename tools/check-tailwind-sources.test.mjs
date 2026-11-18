import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { checkTailwindSources, covered, sourcePatterns } from "./check-tailwind-sources.mjs";

const roots = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(root, file, text) {
	mkdirSync(dirname(join(root, file)), { recursive: true });
	writeFileSync(join(root, file), text);
}

function uiPackage(root, dir, name, source = 'export const X = () => <div className="p-1" />;\n') {
	write(root, `${dir}/package.json`, JSON.stringify({ name }));
	write(root, `${dir}/src/index.tsx`, source);
}

function fixture(sources) {
	const root = mkdtempSync(join(tmpdir(), "yonder-tailwind-sources-"));
	roots.push(root);
	write(root, "apps/web/package.json", JSON.stringify({ name: "@yonder/web" }));
	write(root, "apps/web/src/index.css", `@import "tailwindcss";\n/* a comment */\n${sources}\n`);
	uiPackage(root, "packages/ui/components", "@yonder/ui-components");
	uiPackage(root, "packages/ui/features/members", "@yonder/feature-members");
	uiPackage(root, "packages/ui/data", "@yonder/ui-data", "export const query = 1;\n");
	return root;
}

function run(root) {
	return spawnSync(process.execPath, [join(import.meta.dirname, "check-tailwind-sources.mjs"), "--root", root], {
		encoding: "utf8",
	});
}

describe("covered", () => {
	const file = "packages/ui/features/me/src/views/page.tsx";
	test("a plain path is a directory that covers every file below it", () => {
		expect(covered(file, ["packages/ui/features"])).toBe(true);
		expect(covered(file, ["packages/ui/features/auth/src"])).toBe(false);
		expect(covered("packages/ui/features-old/x.tsx", ["packages/ui/features"])).toBe(false);
	});

	test("a glob is a file pattern, as in Tailwind", () => {
		expect(covered(file, ["packages/ui/features/*/src/**/*.{ts,tsx}"])).toBe(true);
		expect(covered(file, ["packages/ui/**"])).toBe(true);
		// Matches files called `src`, not the directory: the bug this check exists for.
		expect(covered(file, ["packages/ui/features/*/src"])).toBe(false);
	});
});

describe("sourcePatterns", () => {
	test("resolves paths against the stylesheet and keeps a glob that looks like a comment opener", () => {
		const root = fixture('@source "../../../packages/ui/features/*/src";\n@source not "../../../packages/ui/x";');
		expect(sourcePatterns(root)).toEqual(["packages/ui/features/*/src"]);
	});
});

describe("checkTailwindSources", () => {
	test("passes when every UI package that writes class names is scanned", () => {
		const root = fixture('@source "../../../packages/ui/components/src";\n@source "../../../packages/ui/features";');
		expect(checkTailwindSources(root).missing).toEqual([]);
		const result = run(root);
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("2 UI packages");
	});

	test("fails when a feature package is not named, and ignores packages without class names", () => {
		const root = fixture(
			'@source "../../../packages/ui/components/src";\n@source "../../../packages/ui/features/*/src";',
		);
		expect(checkTailwindSources(root).missing).toEqual(["packages/ui/features/members"]);
		const result = run(root);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("packages/ui/features/members/src is not covered");
		expect(result.stderr).not.toContain("packages/ui/data");
	});
});
