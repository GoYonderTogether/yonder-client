#!/usr/bin/env node
// Tailwind sources: every workspace UI package that writes class names must be scanned.
//
// Tailwind only generates a class it has seen in a scanned file. The web app reaches the UI
// packages through `node_modules` symlinks, which Tailwind skips, so each package has to be named
// by an `@source` line in `apps/web/src/index.css`. A package that is missing there renders with
// half its styles silently absent (2026-11-18: `features/members` lost its switch and spacing).
//
// A package needs coverage when a file under its `src/` contains `className`, and every such file
// must be scanned. Like Tailwind, a path without glob characters is a directory that covers all
// files below it; a path with `*`, `**`, `?` or `{a,b}` is a file glob that must match the file.
//
// Usage: node tools/check-tailwind-sources.mjs [--root <dir>]
import { readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readPackages, sourceFiles } from "./check-entry-imports.mjs";

export const STYLESHEET = "apps/web/src/index.css";
const UI_ROOT = "packages/ui/";
const SOURCE_PATTERN = /@source\s+(?:not\s+)?["']([^"']+)["']/g;
const toPosix = (path) => path.split(sep).join("/");

/** The `@source` paths in a stylesheet, repo-relative, `not` exclusions dropped. */
export function sourcePatterns(root, stylesheet = STYLESHEET) {
	// Drop comments but keep strings: a glob such as "features/*/src" contains a comment opener.
	const css = readFileSync(join(root, stylesheet), "utf8").replace(
		/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\/\*[\s\S]*?\*\//g,
		(_, string) => string ?? "",
	);
	const base = dirname(join(root, stylesheet));
	const patterns = [];
	for (const match of css.matchAll(SOURCE_PATTERN)) {
		if (/@source\s+not\b/.test(match[0])) continue;
		patterns.push(toPosix(relative(root, resolve(base, match[1]))));
	}
	return patterns;
}

const GLOB = /[*?{]/;

function globRegex(pattern) {
	let body = "";
	for (let index = 0; index < pattern.length; index++) {
		const char = pattern[index];
		if (char === "*" && pattern[index + 1] === "*") {
			body += pattern[index + 2] === "/" ? "(?:.*/)?" : ".*";
			index += pattern[index + 2] === "/" ? 2 : 1;
		} else if (char === "*") body += "[^/]*";
		else if (char === "?") body += "[^/]";
		else if (char === "{") {
			const close = pattern.indexOf("}", index);
			body += `(?:${pattern
				.slice(index + 1, close)
				.split(",")
				.map((part) => part.replace(/[.+^$()|[\]\\]/g, "\\$&"))
				.join("|")})`;
			index = close;
		} else body += char.replace(/[.+^$()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`^${body}$`);
}

/** True when one `@source` pattern scans `file` (repo-relative). */
export function covered(file, patterns) {
	return patterns.some((pattern) =>
		GLOB.test(pattern) ? globRegex(pattern).test(file) : file === pattern || file.startsWith(`${pattern}/`),
	);
}

function classNameFiles(root, directory) {
	try {
		if (!statSync(join(root, directory, "src")).isDirectory()) return [];
	} catch {
		return [];
	}
	return sourceFiles(root, join(root, directory, "src")).filter((file) =>
		readFileSync(join(root, file), "utf8").includes("className"),
	);
}

/** `{ checked, missing }`: UI package directories that need scanning, and the ones not fully scanned. */
export function checkTailwindSources(root) {
	const patterns = sourcePatterns(root);
	const checked = [];
	const missing = [];
	for (const pkg of readPackages(root).filter((item) => item.dir.startsWith(UI_ROOT))) {
		const files = classNameFiles(root, pkg.dir);
		if (files.length === 0) continue;
		checked.push(pkg.dir);
		if (!files.every((file) => covered(file, patterns))) missing.push(pkg.dir);
	}
	return { checked: checked.sort(), missing: missing.sort(), patterns };
}

function main(argv) {
	const rootFlag = argv.indexOf("--root");
	const root = rootFlag === -1 ? fileURLToPath(new URL("../", import.meta.url)) : resolve(argv[rootFlag + 1]);
	const { checked, missing } = checkTailwindSources(root);
	for (const dir of missing) console.error(`error: ${dir}/src is not covered by an @source line in ${STYLESHEET}`);
	if (missing.length > 0) {
		console.error(`tailwind-sources check failed: ${missing.length} package(s) unscanned`);
		return 1;
	}
	console.log(`tailwind-sources check passed: ${checked.length} UI packages scanned by ${STYLESHEET}`);
	return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exitCode = main(process.argv.slice(2));
}
