import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

function block(source, selector) {
	const start = source.indexOf("{", source.indexOf(selector));
	let depth = 1;
	let end = start + 1;
	for (; end < source.length && depth; end++) {
		if (source[end] === "{") depth++;
		if (source[end] === "}") depth--;
	}
	return source.slice(start + 1, end - 1);
}
function variables(css) {
	return [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)]
		.filter(([, _name, value]) => !value.includes("linear("))
		.map(([, name, value]) => `  ${name}: ${value.trim()};`)
		.join("\n");
}
export function generateTokens(source, motionSource = "") {
	const theme = variables(block(source, "@theme"));
	const light = variables(block(source, '[data-theme="light"]'));
	const dark = variables(block(source, '[data-theme="dark"]'));
	// The motion tokens live in `motion.css`; the mini-program has no import chain, so they are
	// appended to the controls block it copies.
	const controls = [variables(block(source, ":root {")), motionSource ? variables(block(motionSource, ":root {")) : ""]
		.filter(Boolean)
		.join("\n");
	return `/* Generated from packages/ui/tokens/src/tokens.css. Run generate-tokens.mjs. */\n/* biome-ignore lint/correctness/noUnknownTypeSelector: WeChat native page root. */\npage, :root {\n${theme}\n${light}\n${controls}\n}\n@media (prefers-color-scheme: dark) {\n/* biome-ignore lint/correctness/noUnknownTypeSelector: WeChat native page root. */\npage, :root {\n${dark}\n} }\n`;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	const source = readFileSync(new URL("../../../../packages/ui/tokens/src/tokens.css", import.meta.url), "utf8");
	const motion = readFileSync(new URL("../../../../packages/ui/tokens/src/motion.css", import.meta.url), "utf8");
	const output = fileURLToPath(new URL("./tokens.scss", import.meta.url));
	writeFileSync(output, generateTokens(source, motion));
	execFileSync(
		fileURLToPath(new URL("../../../../node_modules/.bin/biome", import.meta.url)),
		["format", "--write", output],
		{ stdio: "ignore" },
	);
}
