#!/usr/bin/env node
// Times read in one zone: the account's, never whichever zone the device happens to be in.
//
// The rules, all of them about code outside `packages/ui/time` (the one module allowed to build a
// formatter):
//   1. resolved-device-zone  — `Intl.DateTimeFormat().resolvedOptions().timeZone`. The device zone
//                              is a fallback for the account's unset zone, read in ui/time only.
//   2. bare-locale-time      — `toLocaleString()` / `toLocaleTimeString()` / `toLocaleDateString()`
//                              without a `timeZone` option: they print the device's clock.
//   3. bare-date-time-format — `new Intl.DateTimeFormat(...)` whose options name no `timeZone`.
//   4. device-clock-getter   — `getHours()`, `getDate()`, `toDateString()`, …: these read the
//                              device's calendar. A line that is genuinely about the device's own
//                              clock (a ticker, a performance measurement) says so with the comment
//                              `time:device-clock` on the same line.
//
// Test files are skipped: a unit test may pin the device zone on purpose. `apps/miniprogram` is
// scanned — it is a separate install but the same rule holds.
//
// Usage: node tools/check-local-time.mjs [--root <dir>]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCANNED = ["apps", "packages"];
const ALLOWED_DIRECTORY = "packages/ui/time/";
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", "build", ".git", "gen", "target"]);
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;
const SUPPRESSION = /time:device-clock/;

const toPosix = (path) => path.split(sep).join("/");

export const RULES = [
	{
		id: "resolved-device-zone",
		what: "reads the device's zone; the account's zone comes from useAccountTimeZone()",
		pattern: /\.resolvedOptions\(\)\s*\.\s*timeZone/g,
	},
	{
		id: "bare-locale-time",
		what: "formats with the device's zone; pass a timeZone from the account's zone",
		pattern: /\btoLocale(?:String|TimeString|DateString)\s*\(/g,
		captureArguments: true,
		suppressible: true,
	},
	{
		id: "bare-date-time-format",
		what: "Intl.DateTimeFormat without a timeZone; formatInstant() names one",
		pattern: /\bnew\s+Intl\.DateTimeFormat\s*\(/g,
		captureArguments: true,
	},
	{
		id: "device-clock-getter",
		what: "reads the device's clock or calendar; use zonedParts/localDay from @yonder/ui-time",
		pattern: /\.get(?:FullYear|Month|Date|Day|Hours|Minutes|Seconds|TimezoneOffset)\(|\.toDateString\(/g,
		suppressible: true,
	},
];

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
			if (TEST_FILE.test(entry)) continue;
			if (file.startsWith(ALLOWED_DIRECTORY)) continue;
			found.push(file);
		}
	};
	for (const directory of SCANNED) walk(join(root, directory));
	return found.sort();
}

/** The text between the parentheses that start at `open`, including nested pairs. */
function argumentsAt(text, open) {
	let depth = 0;
	for (let index = open; index < text.length; index += 1) {
		const character = text[index];
		if (character === "(") depth += 1;
		else if (character === ")") {
			depth -= 1;
			if (depth === 0) return text.slice(open + 1, index);
		}
	}
	return text.slice(open + 1);
}

/** Every hit in one file, each with the rule it broke and the line it is on. */
export function violationsIn(text, file) {
	const problems = [];
	const lines = text.split("\n");
	const lineAt = (index) => text.slice(0, index).split("\n").length;
	for (const rule of RULES) {
		for (const match of text.matchAll(rule.pattern)) {
			const index = match.index ?? 0;
			const line = lineAt(index);
			// The marker sits on the hit's own line or on the line just above it, where a comment
			// explaining the whole statement reads better.
			if (rule.suppressible && (SUPPRESSION.test(lines[line - 1] ?? "") || SUPPRESSION.test(lines[line - 2] ?? "")))
				continue;
			if (rule.captureArguments) {
				const open = index + match[0].length - 1;
				if (/\btimeZone\b/.test(argumentsAt(text, open))) continue;
			}
			problems.push({ file, line, rule: rule.id, what: rule.what });
		}
	}
	return problems.sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
}

export function checkLocalTime(root) {
	const problems = [];
	for (const file of scannedFiles(root)) {
		problems.push(...violationsIn(readFileSync(join(root, file), "utf8"), file));
	}
	return problems;
}

function main(argv) {
	const rootFlag = argv.indexOf("--root");
	const root = rootFlag === -1 ? fileURLToPath(new URL("../", import.meta.url)) : resolve(argv[rootFlag + 1]);
	const problems = checkLocalTime(root);
	if (problems.length > 0) {
		console.error(`local-time check failed (${problems.length}):`);
		for (const problem of problems) console.error(`  ${problem.file}:${problem.line}: ${problem.what}`);
		return 1;
	}
	console.log(`local-time check passed (${scannedFiles(root).length} files)`);
	return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exitCode = main(process.argv.slice(2));
}
