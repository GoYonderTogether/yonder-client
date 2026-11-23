import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { BOT_AVATAR_COLORS, BOT_NAMES, randomBotName } from "./bot-defaults.ts";
import { loadQrDecoder } from "./qr-decoder.ts";
import { qrTarget } from "./qr-target.ts";

const origin = "https://yonder.zethai.cn";

test("accepts member and invite routes, handles and phone numbers, not arbitrary links", () => {
	expect(qrTarget(`${origin}/@Willow7?source=qr`, origin)).toBe("@willow7");
	expect(qrTarget(`${origin}/i/abc234def5`, origin)).toBe("/i/abc234def5");
	expect(qrTarget("@Willow7", origin)).toBe("@willow7");
	expect(qrTarget("+8613812345678", origin)).toBe("+8613812345678");
	for (const invalid of [
		"https://evil.test/@willow7",
		"javascript:alert(1)",
		"https://user:pass@yonder.zethai.cn/@willow7",
		"/settings",
		"a__xyz",
		"short",
		"https://yonder.zethai.cn/@willow7#script",
	]) {
		expect(qrTarget(invalid, origin)).toBeNull();
	}
});

test("accepts both production origins on either official host, but not on a self-hosted service", () => {
	const canonical = "https://yonderbot.net";
	expect(qrTarget(`${origin}/@Willow7?i=legacy`, canonical)).toBe("@willow7");
	expect(qrTarget(`${canonical}/i/abc234def5`, origin)).toBe("/i/abc234def5");
	expect(qrTarget(`${canonical}/@Willow7`, "https://self.example")).toBeNull();
	expect(qrTarget("https://yonderbot.net.evil.test/@Willow7", origin)).toBeNull();
});

test("a real QR pixel matrix decodes into the existing member route", async () => {
	const fixture = JSON.parse(readFileSync(new URL("./fixtures/member-qr.json", import.meta.url), "utf8")) as {
		content: string;
		rows: string[];
	};
	const scale = 6;
	const width = (fixture.rows.length + 8) * scale;
	const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
	for (let y = 0; y < width; y++) {
		for (let x = 0; x < width; x++) {
			const black = fixture.rows[Math.floor(y / scale) - 4]?.[Math.floor(x / scale) - 4] === "1";
			if (black) pixels.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
		}
	}
	const decode = await loadQrDecoder();
	const code = decode(pixels, width, width);
	expect(code?.data).toBe(fixture.content);
	expect(qrTarget(code?.data ?? "", origin)).toBe("@willow7");
});

test("default Bot names are single words from the local name library and use existing palette IDs", () => {
	for (let i = 0; i < 20; i++) expect(BOT_NAMES).toContain(randomBotName("zh-CN"));
	expect(BOT_NAMES.every((name) => /^[A-Za-z]+$/.test(name))).toBe(true);
	expect(BOT_AVATAR_COLORS).toEqual(["1", "2", "3", "4", "5", "6"]);
});
