#!/usr/bin/env node
// A package may only be imported through its entry (`src/index.ts`).
//
// Allowed:   import { x } from "@yonder/protocol"
// Rejected:  import { x } from "@yonder/protocol/src/version/version-payload.ts"
//            import { x } from "../../packages/protocol/src/version/version-payload.ts"
//            const x = await import("@yonder/protocol/src/index.ts")
//
// Packages live at `packages/<name>` and at nested paths such as `packages/ui/components`; both
// are discovered by looking for a package.json. Apps live at `apps/<name>`.
//
// Usage: node tools/check-entry-imports.mjs [--root <dir>]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const SKIP_DIRECTORIES = new Set(["node_modules", "dist", "gen", "target", ".git", "build"]);
// Product code only: tools/ holds this checker's own fixtures, which quote import specifiers as strings.
const SCANNED_DIRECTORIES = ["packages", "apps"];
/** `from "x"`, `import("x")`, `require("x")` and side-effect `import "x"`. */
const SPECIFIER_PATTERN = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\1/g;

const toPosix = (path) => path.split(sep).join("/");

/** Every workspace package below `dir`: `{ name, dir }`, dir repo-relative with forward slashes. */
function packagesUnder(root, dir) {
	const found = [];
	const walk = (current) => {
		for (const entry of readDirectories(current)) {
			const absolute = join(current, entry);
			let manifest;
			try {
				manifest = JSON.parse(readFileSync(join(absolute, "package.json"), "utf8"));
			} catch {
				manifest = null;
			}
			if (manifest && typeof manifest.name === "string") {
				found.push({ name: manifest.name, dir: toPosix(relative(root, absolute)) });
				continue;
			}
			walk(absolute);
		}
	};
	walk(join(root, dir));
	return found;
}

/** Every workspace package: `packages/**` (nested allowed) and `apps/*`. */
export function readPackages(root) {
	return [...packagesUnder(root, "packages"), ...packagesUnder(root, "apps")];
}

function readDirectories(dir) {
	try {
		return readdirSync(dir).filter((entry) => {
			try {
				return statSync(join(dir, entry)).isDirectory() && !SKIP_DIRECTORIES.has(entry) && !entry.startsWith(".");
			} catch {
				return false;
			}
		});
	} catch {
		return [];
	}
}

/** Every source file below `dir`, repo-relative. */
export function sourceFiles(root, dir) {
	const found = [];
	const walk = (current) => {
		for (const entry of readdirSync(current)) {
			const path = join(current, entry);
			if (statSync(path).isDirectory()) {
				if (!SKIP_DIRECTORIES.has(entry)) walk(path);
			} else if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
				found.push(toPosix(relative(root, path)));
			}
		}
	};
	try {
		walk(dir);
	} catch {
		return [];
	}
	return found.sort();
}

/**
 * Does `specifier` (written in `importer`, an absolute path) reach past a package's entry?
 * Returns a human-readable reason or null.
 */
export function violationFor(specifier, importer, packages, root) {
	const importerRelative = toPosix(relative(root, importer));

	for (const pkg of packages) {
		if (specifier === pkg.name || specifier.startsWith(`${pkg.name}/`)) {
			const subpath = specifier.slice(pkg.name.length);
			if (subpath === "" || subpath === "/package.json") return null;
			return `${pkg.name} must be imported through its entry (got "${specifier}")`;
		}
		if (!specifier.startsWith(".")) continue;

		// A relative import that lands inside another package.
		const target = toPosix(relative(root, resolve(dirname(importer), specifier)));
		if (target !== pkg.dir && !target.startsWith(`${pkg.dir}/`)) continue;
		if (importerRelative.startsWith(`${pkg.dir}/`)) continue; // inside the same package: fine
		return `${pkg.name} must be imported through its entry (got a relative path into ${target})`;
	}
	return null;
}

export function checkEntryImports(root) {
	const packages = readPackages(root);
	const problems = [];
	for (const workspace of SCANNED_DIRECTORIES) {
		for (const file of sourceFiles(root, join(root, workspace))) {
			const importer = join(root, file);
			const text = readFileSync(importer, "utf8");
			for (const match of text.matchAll(SPECIFIER_PATTERN)) {
				const reason = violationFor(match[2], importer, packages, root);
				if (reason) problems.push(`${file}: ${reason}`);
			}
		}
	}
	return problems;
}

function main(argv) {
	const rootFlag = argv.indexOf("--root");
	const root = rootFlag === -1 ? fileURLToPath(new URL("../", import.meta.url)) : resolve(argv[rootFlag + 1]);
	const problems = checkEntryImports(root);
	if (problems.length > 0) {
		console.error(`entry-import check failed (${problems.length}):`);
		for (const problem of problems) console.error(`  ${problem}`);
		return 1;
	}
	console.log(`entry-import check passed (${readPackages(root).length} packages)`);
	return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	process.exitCode = main(process.argv.slice(2));
}
