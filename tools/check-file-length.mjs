#!/usr/bin/env node
// File length: warn at 300 lines, fail at 500 lines.
//
// Applies to hand-written source (ts, tsx, mts, cts, js, jsx, mjs, cjs, css, rs) in packages,
// apps and tools. Build output, generated platform projects, vendored code and lockfiles are
// skipped. An over-long file should be split by responsibility, not shortened by reformatting.
//
// Usage: node tools/check-file-length.mjs [--root <dir>] [--warn-at 300] [--fail-at 500]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const WARN_AT = 300;
export const FAIL_AT = 500;

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".css", ".rs"];
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", "gen", "target", ".git", "build", "icons"]);
const SCANNED_DIRECTORIES = ["packages", "apps", "tools", "scripts"];

/** Line count of `text`, where a trailing newline does not add an empty line. */
export function countLines(text) {
	const lines = text.split("\n");
	if (lines.at(-1) === "") lines.pop();
	return lines.length;
}

/** Every scannable file below `root`, repo-relative with forward slashes. */
export function scannedFiles(root) {
	const found = [];
	const walk = (current) => {
		for (const entry of readdirSync(current)) {
			const path = join(current, entry);
			if (statSync(path).isDirectory()) {
				if (!SKIP_DIRECTORIES.has(entry)) walk(path);
			} else if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
				found.push(relative(root, path).split(sep).join("/"));
			}
		}
	};
	for (const directory of SCANNED_DIRECTORIES) {
		try {
			walk(join(root, directory));
		} catch {
			// Directory absent: nothing to scan.
		}
	}
	return found.sort();
}

/** `{ warnings, failures }` as `[{ file, lines }]`, longest first. */
export function checkFileLength(root, { warnAt = WARN_AT, failAt = FAIL_AT } = {}) {
	const warnings = [];
	const failures = [];
	for (const file of scannedFiles(root)) {
		const lines = countLines(readFileSync(join(root, file), "utf8"));
		if (lines >= failAt) failures.push({ file, lines });
		else if (lines >= warnAt) warnings.push({ file, lines });
	}
	const longestFirst = (left, right) => right.lines - left.lines;
	return { warnings: warnings.sort(longestFirst), failures: failures.sort(longestFirst) };
}

function main(argv) {
	const flag = (name, fallback) => {
		const index = argv.indexOf(name);
		return index === -1 ? fallback : Number(argv[index + 1]);
	};
	const rootFlag = argv.indexOf("--root");
	const root = rootFlag === -1 ? fileURLToPath(new URL("../", import.meta.url)) : resolve(argv[rootFlag + 1]);
	const warnAt = flag("--warn-at", WARN_AT);
	const failAt = flag("--fail-at", FAIL_AT);
	const { warnings, failures } = checkFileLength(root, { warnAt, failAt });

	for (const { file, lines } of warnings) console.warn(`warning: ${file} is ${lines} lines (warn at ${warnAt})`);
	for (const { file, lines } of failures) console.error(`error: ${file} is ${lines} lines (fail at ${failAt})`);

	if (failures.length > 0) {
		console.error(`file-length check failed: ${failures.length} file(s) over ${failAt} lines`);
		return 1;
	}
	console.log(`file-length check passed (${warnings.length} warning(s), warn at ${warnAt}, fail at ${failAt})`);
	return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	process.exitCode = main(process.argv.slice(2));
}
