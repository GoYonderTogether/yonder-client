// Regenerate the brand assets and web icons from the selected geometry.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { faviconSVG, markSVG } from "../src/yonder-mark.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, "brand/assets");
const web = join(root, "apps/web/public");
for (const dir of ["svg", "png", "macos"]) mkdirSync(join(out, dir), { recursive: true });

const svgs = {
	"svg/yonder-mark.svg": markSVG(),
	"svg/yonder-mark-black.svg": markSVG({ color: "#111315" }),
	"svg/yonder-mark-white.svg": markSVG({ color: "#ffffff", reverse: true }),
	"macos/menubar-template.svg": markSVG({ color: "#000000" }),
};
for (const [name, svg] of Object.entries(svgs)) writeFileSync(join(out, name), svg);
writeFileSync(join(web, "favicon.svg"), faviconSVG());

const chrome = [
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
].find(existsSync);
const temp = mkdtempSync(join(root, "brand/.build-"));
process.env.TMPDIR = temp;
try {
	const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
	try {
		const page = await browser.newPage({ deviceScaleFactor: 1 });
		const black = svgs["svg/yonder-mark-black.svg"];
		const render = async (file, svg, size, opaque = false) => {
			await page.setViewportSize({ width: size, height: size });
			await page.setContent(
				`<style>html,body{margin:0;background:${opaque ? "white" : "transparent"}}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
			);
			await page.screenshot({ path: file, omitBackground: !opaque });
		};
		const renderHTML = async (file, html, size, opaque = false) => {
			await page.setViewportSize({ width: size, height: size });
			await page.setContent(html);
			await page.screenshot({ path: file, omitBackground: !opaque });
		};
		// App icons. The mark's 512 canvas is drawn at 85% of the tile, so the mark itself covers
		// about 62% of the tile's width on every platform.
		//
		// iOS and Android mask the icon themselves: their source is a full-bleed opaque square.
		await renderHTML(join(out, "png/yonder-tile-ink-1024.png"), appIconHTML({ size: 1024, tile: 1024 }), 1024, true);
		// macOS and Windows show the file as it is, so it is the rounded tile itself, on Apple's
		// grid: an 824 body inset 100 on a 1024 canvas, corner radius 185, a soft shadow below.
		await renderHTML(join(out, "png/yonder-app-icon-1024.png"), appIconHTML({ size: 1024, tile: 824 }), 1024);
		for (const size of [16, 32, 48]) await render(join(web, `favicon-${size}.png`), black, size);
		for (const [name, size] of [
			["apple-touch-icon.png", 180],
			["icon-192.png", 192],
			["icon-512.png", 512],
		]) {
			await render(join(web, name), black, size, true);
		}
		for (const [name, size] of [
			["menubar-template.png", 18],
			["menubar-template@2x.png", 36],
		]) {
			await render(join(out, "macos", name), svgs["macos/menubar-template.svg"], size);
		}
	} finally {
		await browser.close();
	}
} finally {
	rmSync(temp, { recursive: true, force: true });
}

/**
 * An app icon page: a white tile of `tile` px centred on a `size` px canvas, holding the black mark.
 * A full-bleed tile (`tile === size`) has square corners and no shadow, because the system masks it.
 */
function appIconHTML({ size, tile }) {
	const inset = (size - tile) / 2;
	const rounded = tile < size;
	const radius = rounded ? Math.round(tile * 0.2245) : 0;
	const shadow = rounded ? "box-shadow:0 10px 18px rgba(0,0,0,.16),0 1px 3px rgba(0,0,0,.10);" : "";
	const mark = Math.round(tile * 0.85);
	return `<style>html,body{margin:0;background:transparent}
.t{position:absolute;left:${inset}px;top:${inset}px;width:${tile}px;height:${tile}px;border-radius:${radius}px;background:#fff;${shadow}display:grid;place-items:center}
svg{width:${mark}px;height:${mark}px;display:block}</style><div class="t">${markSVG({ color: "#111315" })}</div>`;
}

const frames = [16, 32, 48].map((size) => ({ size, data: readFileSync(join(web, `favicon-${size}.png`)) }));
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach(({ size, data }, index) => {
	const entry = 6 + 16 * index;
	header.writeUInt8(size, entry);
	header.writeUInt8(size, entry + 1);
	header.writeUInt16LE(1, entry + 4);
	header.writeUInt16LE(32, entry + 6);
	header.writeUInt32LE(data.length, entry + 8);
	header.writeUInt32LE(offset, entry + 12);
	offset += data.length;
});
writeFileSync(join(web, "favicon.ico"), Buffer.concat([header, ...frames.map(({ data }) => data)]));
writeFileSync(
	join(web, "site.webmanifest"),
	`${JSON.stringify(
		{
			name: "Yonder",
			icons: [
				{ src: "icon-192.png", sizes: "192x192", type: "image/png" },
				{ src: "icon-512.png", sizes: "512x512", type: "image/png" },
			],
			theme_color: "#f5f5f3",
			background_color: "#ffffff",
		},
		null,
		"\t",
	)}\n`,
);

writeFileSync(
	join(out, "preview.html"),
	`<!doctype html>
<html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>标志资产</title><style>
body{margin:0;padding:32px;background:#f5f5f3;color:#111315;font:14px/1.5 system-ui,sans-serif}
main{max-width:800px;margin:auto}section{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0}
figure div{display:grid;place-items:center;width:180px;height:180px;background:#fff}
figure .dark{background:#111110}figure img{width:100%;height:100%}figcaption{margin-top:8px}
</style><main><h1>标志资产</h1><p>浅色底使用正形，深色底使用反白几何。</p><section>
<figure><div><img src="svg/yonder-mark-black.svg" alt="浅色底标志"></div><figcaption>浅色</figcaption></figure>
<figure><div class="dark"><img src="svg/yonder-mark-white.svg" alt="深色底反白标志"></div><figcaption>深色</figcaption></figure>
<figure><div><img src="png/yonder-tile-ink-1024.png" alt="应用图标"></div><figcaption>应用图标</figcaption></figure>
</section></main></html>\n`,
);

for (const old of [
	"web",
	"png/yonder-mark-512.png",
	"png/yonder-mark-white-512.png",
	"png/yonder-tile-night-1024.png",
	"svg/yonder-mark-moon.svg",
	"svg/yonder-mark-small.svg",
	"svg/yonder-mark-small-white.svg",
	"svg/yonder-tile-ink.svg",
	"svg/yonder-tile-night.svg",
	"svg/yonder-tile-small-ink.svg",
])
	rmSync(join(out, old), { recursive: true, force: true });
console.log("Generated brand assets and web icons.");
