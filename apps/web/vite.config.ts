import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The version shown in 「我 → 关于」 comes from this package's manifest, so the build, the desktop
// bundle and the release all agree without a second source of truth.
const manifest = (await import("./package.json", { with: { type: "json" } })).default as { version: string };
const apiTarget = process.env.YONDER_API_PROXY ?? "http://127.0.0.1:8090";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	define: {
		__YONDER_VERSION__: JSON.stringify(manifest.version),
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
