import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { checkLocalTime, violationsIn } from "./check-local-time.mjs";

const roots = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(root, file, text) {
	mkdirSync(dirname(join(root, file)), { recursive: true });
	writeFileSync(join(root, file), text);
}

function fixture(files) {
	const root = mkdtempSync(join(tmpdir(), "yonder-local-time-"));
	roots.push(root);
	for (const [file, text] of Object.entries(files)) write(root, file, text);
	return root;
}

function run(root) {
	return spawnSync(process.execPath, [join(import.meta.dirname, "check-local-time.mjs"), "--root", root], {
		encoding: "utf8",
	});
}

describe("violationsIn", () => {
	test("a bare toLocaleTimeString is a violation; one with a timeZone is not", () => {
		const bare = violationsIn("const label = at.toLocaleTimeString();\n", "apps/web/src/a.ts");
		expect(bare.map((problem) => problem.rule)).toEqual(["bare-locale-time"]);
		const zoned = violationsIn(
			'const label = at.toLocaleTimeString("en", { timeZone: "Asia/Shanghai", hour: "2-digit" });\n',
			"apps/web/src/a.ts",
		);
		expect(zoned).toEqual([]);
	});

	test("Intl.DateTimeFormat without a timeZone is a violation, one with it is not", () => {
		expect(violationsIn('const f = new Intl.DateTimeFormat("en");', "x.ts").map((p) => p.rule)).toEqual([
			"bare-date-time-format",
		]);
		expect(
			violationsIn('const f = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: zone });', "x.ts"),
		).toEqual([]);
		expect(
			violationsIn(
				'const f = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(at);',
				"x.ts",
			).map((p) => p.rule),
		).toEqual(["bare-date-time-format"]);
	});

	test("reading the device's zone and clock is a violation", () => {
		expect(
			violationsIn("const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;", "x.ts").map((p) => p.rule),
		).toEqual(["resolved-device-zone"]);
		expect(violationsIn("const hours = at.getHours();", "x.ts").map((p) => p.rule)).toEqual(["device-clock-getter"]);
		expect(violationsIn("const day = at.toDateString();", "x.ts").map((p) => p.rule)).toEqual(["device-clock-getter"]);
	});

	test("a line that declares itself the device's own clock is left alone", () => {
		const source = "const tick = Date.now(); // time:device-clock — a ticker, not a calendar\n";
		expect(violationsIn(source, "x.ts")).toEqual([]);
	});

	test("the violation names the line it is on", () => {
		const [problem] = violationsIn("const a = 1;\nconst b = 2;\nconst c = at.toLocaleDateString();\n", "x.ts");
		expect(problem?.line).toBe(3);
	});
});

describe("checkLocalTime", () => {
	test("the time package and test files may build formatters of their own", () => {
		const root = fixture({
			"packages/ui/time/src/index.ts": 'const f = new Intl.DateTimeFormat("en");',
			"apps/web/src/page.test.tsx": "const x = at.toLocaleTimeString();",
		});
		expect(checkLocalTime(root)).toEqual([]);
	});

	test("a page that prints an instant in the device's zone fails the run", () => {
		const root = fixture({
			"apps/web/src/page.tsx": "export const label = (at: Date) => at.toLocaleTimeString();\n",
		});
		const result = run(root);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("apps/web/src/page.tsx:1");
	});

	test("a clean tree passes and says what it scanned", () => {
		const root = fixture({
			"apps/web/src/page.tsx":
				'export const label = (at: Date, zone: string) => formatInstant(at, { zone, locale: "en", style: "time" });\n',
		});
		const result = run(root);
		expect(result.status).toBe(0);
		expect(result.stdout).toContain("local-time check passed");
	});
});
