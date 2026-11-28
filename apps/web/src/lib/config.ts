/**
 * The version this bundle was built with. `vite.config.ts` replaces the identifier at build time,
 * so the About section and the server can be compared without asking the network.
 */
export const BUILD_VERSION: string = __YONDER_VERSION__;
export const NATIVE_BUILD_CHANNEL = import.meta.env.VITE_YONDER_BUILD_CHANNEL === "beta" ? "beta" : "stable";

/** The production API origin, used by a shell build that was not given one at build time. */
export const PRODUCTION_API_ORIGIN = "https://yonderbot.net";
export const LEGACY_API_ORIGIN = "https://yonder.zethai.cn";

/**
 * Where the API lives.
 *
 * - On the web the page and the API share an origin, so `""` is right: `/v1` and `/files` are
 *   same-origin requests (and the dev server proxies them).
 * - Inside a shell the page is loaded from `tauri://localhost`, so a relative URL would be resolved
 *   by the webview against a scheme that has no server. The shell therefore needs an absolute
 *   origin: `VITE_API_BASE` when the build was given one, otherwise the production origin.
 */
export function apiBaseUrl(options: { shell?: boolean; dev?: boolean; configuredBase?: string } = {}): string {
	const configured = options.configuredBase ?? import.meta.env.VITE_API_BASE;
	if (typeof configured === "string" && configured.trim() !== "") {
		const url = new URL(configured.trim());
		if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
			throw new Error("A custom Yonder server must use HTTPS, except on localhost.");
		}
		if (url.username || url.password || url.search || url.hash) {
			throw new Error("The server address must be an origin, without credentials, query or hash.");
		}
		return url.origin + url.pathname.replace(/\/$/, "");
	}
	// `tauri dev` loads the page from the Vite dev server, which proxies the API like on the web.
	// (On Windows a release build is also served over http://tauri.localhost, so check the build
	// mode, not the protocol.)
	if (options.shell && !options.dev) return PRODUCTION_API_ORIGIN;
	return "";
}
