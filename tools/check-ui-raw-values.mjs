#!/usr/bin/env node
// UI raw values: colours, font sizes, radii and weights come from tokens, confirmations from
// ConfirmDialog (docs/design-system.md). This counts the values written around them.
//
// Scans `apps/web/src` and `packages/ui` (.ts, .tsx, .css). Skipped: the tokens package, vendored
// code, the dev component previews, the landing page's own CSS (it keeps a separate scale), tests.
//
// Pages still hold older offenders, so `tools/ui-raw-values.baseline.json` records today's count
// per file and category. The check fails when a file's count rises or a file that is not in the
// baseline has any; it passes, and says so, when counts fall. After removing offenders run with
// `--update` so the baseline shrinks with the code.
//
// Usage: node tools/check-ui-raw-values.mjs [--root <dir>] [--update]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const BASELINE = "tools/ui-raw-values.baseline.json";
const SCANNED = ["apps/web/src", "packages/ui"];
const EXTENSIONS = [".ts", ".tsx", ".css"];
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", "vendor", ".git"]);
const SKIP_PATHS = [/^packages\/ui\/tokens\//, /^apps\/web\/src\/dev\//, /^packages\/ui\/features\/landing\/.*\.css$/];
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

/** Each rule: a name for the report, which files it reads, and the pattern it counts. */
export const RULES = [
	{
		id: "hex-color",
		what: "a #hex colour; use a --color-* token",
		files: /\.(tsx?|css)$/,
		// 3, 4, 6 or 8 hex digits, not part of a longer word (so `#root` or `#add-member` pass).
		pattern: /(?<![\w&/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
	},
	{
		id: "rgb-color",
		what: "an rgb()/hsl() colour; use a --color-* token",
		files: /\.(tsx?|css)$/,
		pattern: /\b(?:rgba?|hsla?)\(/g,
	},
	{
		id: "text-px",
		what: "text-[Npx]; use the eight-step type scale",
		files: /\.tsx?$/,
		pattern: /\btext-\[\d+(?:\.\d+)?px\]/g,
	},
	{
		id: "radius-raw",
		what: "a radius written as a number; use a --radius-* token",
		files: /\.(tsx?|css)$/,
		pattern:
			/\brounded(?:-[a-z]{1,2})?-\[\d+(?:\.\d+)?(?:px|%|r?em)\]|\bborder(?:-[a-z]+){0,2}-radius:\s*[^;{}]*?(?<![\w-])(?:0?\.\d+|[1-9]\d*(?:\.\d+)?)(?:px|%|r?em)\b/g,
	},
	{
		id: "font-weight-number",
		what: "a numeric font-weight; use var(--font-weight-*) so dark mode can adjust it",
		files: /\.(tsx?|css)$/,
		pattern: /\bfont-weight:\s*\d|\bfontWeight:\s*["']?\d|\bfont-\[\d{3}\]/g,
	},
	{
		id: "window-confirm",
		what: "window.confirm(); use ConfirmDialog from @yonder/ui-shell",
		files: /\.tsx?$/,
		pattern: /\b(?:window|globalThis)\.confirm\(/g,
	},
];

const toPosix = (path) => path.split(sep).join("/");

export function scannedFiles(root) {
	const found = [];
	const walk = (current) => {
		let entries;
		try {
			entries = readdirSync(current);
		} catch {
			return;
		}
		for (const entry of entries) {
			const path = join(current, entry);
			if (statSync(path).isDirectory()) {
				if (!SKIP_DIRECTORIES.has(entry)) walk(path);
				continue;
			}
			const file = toPosix(relative(root, path));
			if (!EXTENSIONS.some((extension) => entry.endsWith(extension))) continue;
			if (TEST_FILE.test(entry) || SKIP_PATHS.some((skip) => skip.test(file))) continue;
			found.push(file);
		}
	};
	for (const directory of SCANNED) walk(join(root, directory));
	return found.sort();
}

/** `{ [file]: { [rule]: count } }` for every scanned file with at least one offender. */
export function countRawValues(root) {
	const counts = {};
	for (const file of scannedFiles(root)) {
		const text = readFileSync(join(root, file), "utf8");
		for (const rule of RULES) {
			if (!rule.files.test(file)) continue;
			const hits = text.match(rule.pattern)?.length ?? 0;
			if (hits === 0) continue;
			counts[file] ??= {};
			counts[file][rule.id] = hits;
		}
	}
	return counts;
}

export function readBaseline(root) {
	const path = join(root, BASELINE);
	if (!existsSync(path)) return {};
	return JSON.parse(readFileSync(path, "utf8")).files ?? {};
}

/** `{ increases, decreases }`, each `[{ file, rule, was, now }]`. */
export function compare(counts, baseline) {
	const increases = [];
	const decreases = [];
	const files = new Set([...Object.keys(counts), ...Object.keys(baseline)]);
	for (const file of [...files].sort()) {
		for (const rule of RULES) {
			const was = baseline[file]?.[rule.id] ?? 0;
			const now = counts[file]?.[rule.id] ?? 0;
			if (now > was) increases.push({ file, rule: rule.id, was, now });
			else if (now < was) decreases.push({ file, rule: rule.id, was, now });
		}
	}
	return { increases, decreases };
}

/** Totals per rule, for the baseline header and the log line. */
export function totals(counts) {
	const sum = Object.fromEntries(RULES.map((rule) => [rule.id, 0]));
	for (const perFile of Object.values(counts)) {
		for (const [rule, hits] of Object.entries(perFile)) sum[rule] += hits;
	}
	return sum;
}

export function writeBaseline(root, counts) {
	const body = {
		description:
			"Raw UI values that existed before tools/check-ui-raw-values.mjs. Counts may only fall; run the check with --update after removing some.",
		totals: totals(counts),
		files: counts,
	};
	writeFileSync(join(root, BASELINE), `${JSON.stringify(body, null, "\t")}\n`);
}

function main(argv) {
	const rootFlag = argv.indexOf("--root");
	const root = rootFlag === -1 ? fileURLToPath(new URL("../", import.meta.url)) : resolve(argv[rootFlag + 1]);
	const counts = countRawValues(root);
	if (argv.includes("--update")) {
		writeBaseline(root, counts);
		console.log(`ui-raw-values baseline written: ${JSON.stringify(totals(counts))}`);
		return 0;
	}
	const { increases, decreases } = compare(counts, readBaseline(root));
	const describe = Object.fromEntries(RULES.map((rule) => [rule.id, rule.what]));
	for (const { file, rule, was, now } of increases) {
		console.error(`error: ${file}: ${now} × ${describe[rule]} (baseline ${was})`);
	}
	if (increases.length > 0) {
		console.error(`ui-raw-values check failed: ${increases.length} new raw value group(s); see docs/design-system.md`);
		return 1;
	}
	if (decreases.length > 0) {
		console.log(
			`ui-raw-values: ${decreases.length} count(s) fell below the baseline; run with --update to lock them in`,
		);
	}
	console.log(`ui-raw-values check passed: ${JSON.stringify(totals(counts))}`);
	return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exitCode = main(process.argv.slice(2));
}
