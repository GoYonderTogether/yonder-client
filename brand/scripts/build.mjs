// Regenerate the brand assets and web icons from the selected geometry.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { faviconSVG, markSVG } from "../src/yonder-mark.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, "brand/assets");
const web = join(root, "apps/web/public");
const android = join(root, "apps/desktop/src-tauri/icons/android");
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
		const black = svgs["svg/yonder-mark-black.svg"];
		const renderHTML = async (file, html, size, opaque = false) => {
			// Resizing a reused page can produce clipped or repeated rows in Chromium screenshots.
			const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: size, height: size } });
			try {
				await page.setContent(html);
				return await page.screenshot({ path: file, omitBackground: !opaque });
			} finally {
				await page.close();
			}
		};
		const render = (file, svg, size, opaque = false) =>
			renderHTML(
				file,
				`<style>html,body{margin:0;background:${opaque ? "white" : "transparent"}}svg{width:100vw;height:100vh;display:block}</style>${svg}`,
				size,
				opaque,
			);
		// App icons. The mark's 512 canvas is drawn at 85% of the tile, so the mark itself covers
		// about 62% of the tile's width on every platform.
		//
		// iOS masks its own full-bleed opaque square.
		await renderHTML(join(out, "png/yonder-tile-ink-1024.png"), appIconHTML({ size: 1024, tile: 1024 }), 1024, true);
		// Android crops the 108dp adaptive layer to a 72dp viewport before masking it.
		// Set the mark against that visible viewport, not against the full layer.
		for (const [density, size] of [
			["mdpi", 108],
			["hdpi", 162],
			["xhdpi", 216],
			["xxhdpi", 324],
			["xxxhdpi", 432],
		]) {
			const dir = join(android, `mipmap-${density}`);
			mkdirSync(dir, { recursive: true });
			await renderHTML(
				join(dir, "ic_launcher_foreground.png"),
				appIconHTML({ size, tile: size, markScale: 0.58 }),
				size,
				true,
			);
		}
		// Desktop and web app icons use the rounded tile on a transparent canvas.
		const appIcon = await renderHTML(
			join(out, "png/yonder-app-icon-1024.png"),
			appIconHTML({ size: 1024, tile: 824 }),
			1024,
		);
		const webIconHTML = `<style>html,body{margin:0}img{width:100vw;height:100vh;display:block}</style><img src="data:image/png;base64,${appIcon.toString("base64")}" alt="">`;
		for (const size of [192, 512]) await renderHTML(join(web, `icon-${size}.png`), webIconHTML, size);
		for (const size of [16, 32, 48]) await render(join(web, `favicon-${size}.png`), black, size);
		await render(join(web, "apple-touch-icon.png"), black, 180, true);
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
 * A full-bleed tile (`tile === size`) has square corners for system masking.
 */
function appIconHTML({ size, tile, markScale = 0.85 }) {
	const inset = (size - tile) / 2;
	const rounded = tile < size;
	const radius = rounded ? Math.round(tile * 0.2245) : 0;
	const mark = Math.round(tile * markScale);
	return `<style>html,body{margin:0;background:transparent}
.t{position:absolute;left:${inset}px;top:${inset}px;width:${tile}px;height:${tile}px;border-radius:${radius}px;background:#fff;display:grid;place-items:center}
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
<figure><div class="dark"><img src="png/yonder-app-icon-1024.png" alt="应用图标"></div><figcaption>应用图标</figcaption></figure>
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
