import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "@tarojs/cli";
import { resolveApiBase } from "./api-base.ts";

const appVersion = JSON.parse(readFileSync(path.resolve(__dirname, "../../../package.json"), "utf8")).version;

const preview = process.env.TARO_ENV === "h5";
const sharedSources = [
	path.resolve(__dirname, "../../../packages/ui/chat-model"),
	path.resolve(__dirname, "../../../packages/ui/chat-presentation"),
	path.resolve(__dirname, "../../../packages/ui/auth-presentation"),
	path.resolve(__dirname, "../../../packages/api-client"),
	path.resolve(__dirname, "../../../packages/protocol"),
	path.resolve(__dirname, "../../../packages/ui/features/legal"),
];

export default defineConfig({
	projectName: "yonder-miniprogram",
	date: "2026-11-15",
	designWidth: 375,
	deviceRatio: { 375: 2, 750: 1 },
	sourceRoot: "src",
	outputRoot: preview ? "preview/dist" : "dist",
	framework: "react",
	compiler: "webpack5",
	cache: { enable: true },
	alias: {
		"@yonder/api-client": path.resolve(__dirname, "../../../packages/api-client/src/index.ts"),
		"@yonder/feature-legal": path.resolve(__dirname, "../../../packages/ui/features/legal/src/index.ts"),
		"@yonder/protocol": path.resolve(__dirname, "../../../packages/protocol/src/index.ts"),
		react: path.resolve(__dirname, "../node_modules/react"),
	},
	defineConstants: {
		YONDER_API_BASE: JSON.stringify(
			resolveApiBase(process.env.YONDER_MINI_API_BASE || (preview ? "http://127.0.0.1:8098" : undefined)),
		),
		YONDER_APP_VERSION: JSON.stringify(appVersion),
	},
	h5: {
		publicPath: "/",
		router: { mode: "hash" },
		compile: { include: sharedSources },
		postcss: { pxtransform: { enable: false } },
	},
	mini: {
		compile: { include: sharedSources },
		postcss: { pxtransform: { enable: false }, cssModules: { enable: false } },
	},
});
