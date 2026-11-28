import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The version shown in 「我 → 关于」 comes from this package's manifest, so the build, the desktop
// bundle and the release all agree without a second source of truth.
const manifest = (await import("./package.json", { with: { type: "json" } })).default as { version: string };
const apiTarget = process.env.YONDER_API_PROXY ?? "http://127.0.0.1:8090";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		// The legacy Word worker uses the same OLE reader as the server, with browser streams.
		alias: [
			{ find: /^stream$/, replacement: createRequire(import.meta.url).resolve("readable-stream/lib/ours/browser.js") },
			{ find: /^buffer$/, replacement: "buffer/" },
			{ find: /^events$/, replacement: "events/" },
		],
	},
	define: {
		__YONDER_VERSION__: JSON.stringify(manifest.version),
		__YONDER_PILOT_API_LOCAL__: JSON.stringify(
			/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/.test(apiTarget),
		),
	},
	server: {
		port: 5173,
		// Development only: the API, the realtime socket and dev-served avatars all live on the
		// cloud server. `ws: true` is what makes the realtime channel work through the proxy.
		proxy: {
			"/api": { target: apiTarget, changeOrigin: false },
			"/v1": { target: apiTarget, changeOrigin: false, ws: true },
			"/files": { target: apiTarget, changeOrigin: false },
		},
	},
	build: {
		// The landing and sign-in chunks are small; a single vendor chunk keeps the first paint simple.
		chunkSizeWarningLimit: 800,
	},
});
