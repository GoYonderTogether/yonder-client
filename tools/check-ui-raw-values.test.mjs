import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { BASELINE, compare, countRawValues } from "./check-ui-raw-values.mjs";

const roots = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(root, file, text) {
	mkdirSync(dirname(join(root, file)), { recursive: true });
	writeFileSync(join(root, file), text);
}

function fixture(files) {
	const root = mkdtempSync(join(tmpdir(), "yonder-ui-raw-values-"));
	roots.push(root);
	mkdirSync(join(root, "tools"), { recursive: true });
	for (const [file, text] of Object.entries(files)) write(root, file, text);
	return root;
}

function run(root, ...args) {
	return spawnSync(process.execPath, [join(import.meta.dirname, "check-ui-raw-values.mjs"), "--root", root, ...args], {
		encoding: "utf8",
	});
}

describe("countRawValues", () => {
	test("counts each category and ignores token references", () => {
		const root = fixture({
			"apps/web/src/page.tsx": [
				'<p className="text-[10px] rounded-[5px] text-[var(--color-text-primary)] rounded-[var(--radius-card)]" />',
				'const ok = document.querySelector("#root");',
				'const color = "#ff0000"; const shade = "rgba(0, 0, 0, 0.5)";',
				'if (window.confirm("Delete?")) remove();',
				"const style = { fontWeight: 600 };",
			].join("\n"),
			"packages/ui/features/me/src/page.css":
				".a { font-weight: 600; border-radius: 6px; }\n.b { font-weight: var(--font-weight-medium); border-radius: var(--radius-card); }\n",
		});
		expect(countRawValues(root)).toEqual({
			"apps/web/src/page.tsx": {
				"hex-color": 1,
				"rgb-color": 1,
				"text-px": 1,
				"radius-raw": 1,
				"font-weight-number": 1,
				"window-confirm": 1,
			},
			"packages/ui/features/me/src/page.css": { "font-weight-number": 1, "radius-raw": 1 },
		});
	});

	test("skips tokens, vendor, dev previews, landing CSS and tests", () => {
		const root = fixture({
			"packages/ui/tokens/src/tokens.css": ":root { --color-x: #ffffff; }\n",
			"packages/ui/components/src/ambient/vendor/shader.tsx": 'const c = "#000000";\n',
			"apps/web/src/dev/token-previews.tsx": 'const c = "#000000";\n',
			"packages/ui/features/landing/src/views/landing.css": ".a { font-weight: 600; }\n",
			"packages/ui/components/src/button/button.test.tsx": 'window.confirm("x");\n',
		});
		expect(countRawValues(root)).toEqual({});
	});
});

describe("compare", () => {
	test("reports rises and falls against the baseline", () => {
		const { increases, decreases } = compare(
			{ "a.tsx": { "text-px": 3 }, "new.tsx": { "hex-color": 1 } },
			{ "a.tsx": { "text-px": 2, "window-confirm": 1 } },
		);
		expect(increases).toEqual([
			{ file: "a.tsx", rule: "text-px", was: 2, now: 3 },
			{ file: "new.tsx", rule: "hex-color", was: 0, now: 1 },
		]);
		expect(decreases).toEqual([{ file: "a.tsx", rule: "window-confirm", was: 1, now: 0 }]);
	});
});

describe("the command", () => {
	test("passes at the baseline, fails when a count rises or a new file offends, and --update shrinks it", () => {
		const root = fixture({ "apps/web/src/a.tsx": '<p className="text-[10px]" />\n' });
		expect(run(root, "--update").status).toBe(0);
		expect(JSON.parse(readFileSync(join(root, BASELINE), "utf8")).files).toEqual({
			"apps/web/src/a.tsx": { "text-px": 1 },
		});
		expect(run(root).status).toBe(0);

		write(root, "apps/web/src/a.tsx", '<p className="text-[10px]" /><b className="text-[12px]" />\n');
		const rose = run(root);
		expect(rose.status).toBe(1);
		expect(rose.stderr).toContain("apps/web/src/a.tsx: 2 × text-[Npx]");

		write(root, "apps/web/src/a.tsx", "<p />\n");
		write(root, "packages/ui/shell/src/b.tsx", 'if (window.confirm("x")) go();\n');
		const added = run(root);
		expect(added.status).toBe(1);
		expect(added.stderr).toContain("packages/ui/shell/src/b.tsx: 1 × window.confirm()");

		write(root, "packages/ui/shell/src/b.tsx", "go();\n");
		const fell = run(root);
		expect(fell.status).toBe(0);
		expect(fell.stdout).toContain("fell below the baseline");
		run(root, "--update");
		expect(JSON.parse(readFileSync(join(root, BASELINE), "utf8")).files).toEqual({});
	});
});
