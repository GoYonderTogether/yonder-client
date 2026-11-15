import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { faviconSVG, MASTER_PATH, markSVG, REVERSE_PATH } from "./yonder-mark.js";

test("generated assets use the selected positive and reverse geometry", async () => {
	expect(REVERSE_PATH).not.toBe(MASTER_PATH);
	const asset = (name: string) => readFile(new URL(`../assets/${name}`, import.meta.url), "utf8");
	expect(await asset("svg/yonder-mark.svg")).toBe(markSVG());
	expect(await asset("svg/yonder-mark-black.svg")).toBe(markSVG({ color: "#111315" }));
	expect(await asset("svg/yonder-mark-white.svg")).toBe(markSVG({ color: "#ffffff", reverse: true }));
	expect(await asset("macos/menubar-template.svg")).toBe(markSVG({ color: "#000000" }));
	const favicon = await readFile(new URL("../../apps/web/public/favicon.svg", import.meta.url), "utf8");
	expect(favicon).toBe(faviconSVG());
	expect(favicon).toContain("prefers-color-scheme:dark");
	expect(favicon).toContain(MASTER_PATH);
	expect(favicon).toContain(REVERSE_PATH);
});
