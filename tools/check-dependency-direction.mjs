#!/usr/bin/env node
// Dependency direction, checked from two sides because either one alone can be worked around:
//   1. package.json — workspace dependencies.
//   2. source — every import specifier that resolves to another workspace package.
//
// Two axes:
//
//   UI layers (architecture 12): apps ▸ features ▸ data ▸ shell ▸ components ▸ tokens, and a
//   feature may never import another feature. i18n sits beside tokens: text tables are leaf
//   content, so everything from components up may read them.
//
//   Server layers: apps ▸ gateway ▸ agent host / platform ▸ storage ▸ protocol.
//   The host calls the device-neutral kernel and model layer; api-client is beside protocol.
//
// Each package declares what it may reach in LAYERS below. A dependency that is not listed is a
// violation even if it points "downwards", so adding a new package means deciding its place.
//
// Usage: node tools/check-dependency-direction.mjs [--root <dir>]
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readPackages, sourceFiles } from "./check-entry-imports.mjs";

// Product code only; tools/ quotes specifiers as strings and is not part of the dependency graph.
const SCANNED_DIRECTORIES = ["packages", "apps"];
const SPECIFIER_PATTERN = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(["'])([^"'\n]+)\1/g;
const toPosix = (path) => path.split(sep).join("/");
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

/**
 * What each package may depend on. `[]` means "nothing at all" — a leaf.
 *
 * Features are listed one by one so that feature-to-feature imports cannot sneak in through a
 * wildcard: a feature only ever sees the layers below it.
 */
export const LAYERS = {
	"@yonder/protocol": [],
	"@yonder/api-client": ["@yonder/protocol"],
	"@yonder/ui-tokens": [],
	"@yonder/auth-presentation": [],
	"@yonder/chat-model": ["@yonder/protocol", "@yonder/ui-time"],
	"@yonder/chat-presentation": ["@yonder/ui-time"],
	"@yonder/ui-time": [],
	"@yonder/ui-i18n": [],
	"@yonder/ui-components": [
		"@yonder/chat-model",
		"@yonder/protocol",
		"@yonder/ui-tokens",
		"@yonder/ui-i18n",
		"@yonder/ui-time",
	],
	"@yonder/ui-shell": ["@yonder/protocol", "@yonder/ui-tokens", "@yonder/ui-i18n", "@yonder/ui-components"],
	"@yonder/ui-data": [
		"@yonder/chat-model",
		"@yonder/protocol",
		"@yonder/api-client",
		"@yonder/ui-tokens",
		"@yonder/ui-i18n",
		"@yonder/ui-components",
		"@yonder/ui-shell",
		"@yonder/ui-time",
	],
	"@yonder/feature-auth": [
		"@yonder/auth-presentation",
		"@yonder/protocol",
		"@yonder/ui-tokens",
		"@yonder/ui-i18n",
		"@yonder/ui-components",
		"@yonder/ui-shell",
		"@yonder/ui-data",
		"@yonder/ui-time",
	],
	"@yonder/feature-me": [
		"@yonder/protocol",
		"@yonder/ui-tokens",
		"@yonder/ui-i18n",
		"@yonder/ui-components",
		"@yonder/ui-shell",
		"@yonder/ui-data",
		"@yonder/ui-time",
	],
	"@yonder/feature-members": [
		"@yonder/chat-model",
		"@yonder/protocol",
		"@yonder/ui-tokens",
		"@yonder/ui-i18n",
		"@yonder/ui-components",
		"@yonder/ui-shell",
		"@yonder/ui-data",
		"@yonder/ui-time",
	],
	"@yonder/feature-landing": [
		"@yonder/ui-tokens",
		"@yonder/ui-i18n",
		"@yonder/ui-components",
		"@yonder/ui-data",
		"@yonder/ui-time",
	],
	"@yonder/feature-meetings": [
		"@yonder/protocol",
		"@yonder/ui-tokens",
		"@yonder/ui-i18n",
		"@yonder/ui-components",
		"@yonder/ui-shell",
		"@yonder/ui-time",
	],
	"@yonder/feature-legal": [],
};

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

/** Workspace packages named in `specifier`, if any. */
function workspaceTargets(specifier, packages) {
	return packages.filter((pkg) => specifier === pkg.name || specifier.startsWith(`${pkg.name}/`));
}

function isApp(pkg) {
	return pkg.dir.startsWith("apps/");
}

/** `packages/protocol` may depend on nothing: no dependency entry, no import of a workspace package. */
function checkProtocolIsolated(root, packages, problems) {
	const protocol = packages.find((pkg) => pkg.name === "@yonder/protocol");
	if (!protocol) return;
	const manifest = JSON.parse(readFileSync(join(root, protocol.dir, "package.json"), "utf8"));
	for (const field of DEPENDENCY_FIELDS) {
		for (const name of Object.keys(manifest[field] ?? {})) {
			problems.push(`${protocol.dir}/package.json: ${field} must stay empty (found "${name}")`);
		}
	}
	for (const file of sourceFiles(root, join(root, protocol.dir))) {
		// Test files may import the test runner; it is a root devDependency, not a protocol dependency.
		if (TEST_FILE.test(file)) continue;
		const text = readFileSync(join(root, file), "utf8");
		for (const match of text.matchAll(SPECIFIER_PATTERN)) {
			if (match[2].startsWith("node:") || match[2].startsWith(".")) continue;
			problems.push(`${file}: protocol must not import "${match[2]}"`);
		}
	}
}

/** A package listed in LAYERS may only reach the packages in its own list. */
function checkDeclaredLayers(root, packages, problems) {
	for (const pkg of packages) {
		if (isApp(pkg)) continue;
		const allowed = LAYERS[pkg.name];
		if (!allowed) {
			problems.push(
				`${pkg.dir}/package.json: package ${pkg.name} is not listed in tools/check-dependency-direction.mjs LAYERS`,
			);
			continue;
		}
		const manifest = JSON.parse(readFileSync(join(root, pkg.dir, "package.json"), "utf8"));
		for (const field of DEPENDENCY_FIELDS) {
			for (const name of Object.keys(manifest[field] ?? {})) {
				const dependency = packages.find((candidate) => candidate.name === name);
				if (!dependency) continue;
				if (isApp(dependency)) {
					problems.push(`${pkg.dir}/package.json: package may not depend on app ${dependency.dir} (${name})`);
				} else if (!allowed.includes(name)) {
					problems.push(`${pkg.dir}/package.json: ${pkg.name} may not depend on ${name} (see LAYERS)`);
				}
			}
		}
	}
}

export function checkDependencyDirection(root) {
	const packages = readPackages(root);
	const problems = [];

	checkDeclaredLayers(root, packages, problems);
	checkProtocolIsolated(root, packages, problems);

	for (const workspace of SCANNED_DIRECTORIES) {
		for (const file of sourceFiles(root, join(root, workspace))) {
			const absolute = join(root, file);
			const owner = packages.find((pkg) => file === pkg.dir || file.startsWith(`${pkg.dir}/`));
			if (!owner) continue;
			const allowed = isApp(owner) ? null : (LAYERS[owner.name] ?? []);
			const text = readFileSync(absolute, "utf8");
			for (const match of text.matchAll(SPECIFIER_PATTERN)) {
				const specifier = match[2];
				const targets = workspaceTargets(specifier, packages);
				for (const target of targets) {
					if (target === owner) continue;
					if (isApp(owner)) continue; // apps may import packages
					if (isApp(target)) {
						problems.push(`${file}: ${owner.dir} may not import app ${target.dir}`);
					} else if (!allowed.includes(target.name)) {
						problems.push(`${file}: ${owner.name} may not import ${target.name} (see LAYERS)`);
					}
				}
				if (!specifier.startsWith(".")) continue;
				const resolved = toPosix(relative(root, resolve(dirname(absolute), specifier)));
				const target = packages.find((pkg) => resolved === pkg.dir || resolved.startsWith(`${pkg.dir}/`));
				if (!target || target === owner) continue;
				if (isApp(owner)) continue;
				if (isApp(target)) {
					problems.push(`${file}: ${owner.dir} may not reach into app ${target.dir}`);
				} else if (!allowed.includes(target.name)) {
					problems.push(`${file}: ${owner.name} may not reach into ${target.name} (see LAYERS)`);
				}
			}
		}
	}

	return problems;
}

function main(argv) {
	const rootFlag = argv.indexOf("--root");
	const root = rootFlag === -1 ? fileURLToPath(new URL("../", import.meta.url)) : resolve(argv[rootFlag + 1]);
	const problems = checkDependencyDirection(root);
	if (problems.length > 0) {
		console.error(`dependency-direction check failed (${problems.length}):`);
		for (const problem of problems) console.error(`  ${problem}`);
		return 1;
	}
	console.log(`dependency-direction check passed (${readPackages(root).length} packages)`);
	return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	process.exitCode = main(process.argv.slice(2));
}
