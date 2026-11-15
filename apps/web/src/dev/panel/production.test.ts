import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { expect, test } from "vitest";

test("the production bundle excludes the developer panel", async () => {
	const markers: Array<[string, URL]> = [
		["YONDER_DEV_PANEL_MARKER", new URL("./index.tsx", import.meta.url)],
		["yonder:open-dev-panel", new URL("../components-page.tsx", import.meta.url)],
		[
			"yonder-dev-realtime-event",
			new URL("../../../../../packages/ui/data/src/realtime/connection.ts", import.meta.url),
		],
		["expireAccessTokenForDev", new URL("../../../../../packages/ui/data/src/query/provider.tsx", import.meta.url)],
	];
	for (const [marker, source] of markers) expect(readFileSync(source, "utf8")).toContain(marker);

	const previousNodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = "production";
	try {
		const result = await build({
			root: fileURLToPath(new URL("../../../", import.meta.url)),
			mode: "production",
			logLevel: "error",
			build: { write: false },
		});
		for (const bundle of Array.isArray(result) ? result : [result]) {
			if (!("output" in bundle)) throw new Error("Expected production build output");
			expect(bundle.output.length).toBeGreaterThan(0);
			for (const file of bundle.output) {
				const content = file.type === "chunk" ? file.code : file.source;
				for (const [marker] of markers) {
					expect(Buffer.from(content).includes(marker), `${file.fileName}: ${marker}`).toBe(false);
				}
			}
		}
	} finally {
		if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = previousNodeEnv;
	}
}, 45_000);
