import { LEGACY_API_ORIGIN, PRODUCTION_API_ORIGIN } from "./config.ts";

const officialOrigins = [PRODUCTION_API_ORIGIN, LEGACY_API_ORIGIN];

/** QR contents are data, never arbitrary navigation or code. */
export function qrTarget(value: string, origin: string): string | null {
	const text = value.trim();
	const handle = /^@?([a-z][a-z0-9_-]{4,18}[a-z0-9])$/i;
	const validHandle = (name: string) => handle.test(name) && !/[_-]{2}/.test(name);
	if (/^\+?\d{6,15}$/.test(text)) return text;
	if (validHandle(text)) return `@${text.replace(/^@/, "").toLowerCase()}`;
	try {
		const url = new URL(text, origin);
		const currentOrigin = new URL(origin).origin;
		const allowedOrigin =
			url.origin === currentOrigin || (officialOrigins.includes(currentOrigin) && officialOrigins.includes(url.origin));
		if (!allowedOrigin || url.username || url.password || url.hash) return null;
		const member = /^\/@([^/]+)\/?$/.exec(url.pathname)?.[1];
		if (member && validHandle(member)) return `@${member.toLowerCase()}`;
		if (/^\/i\/[A-Za-z0-9_-]{1,64}\/?$/.test(url.pathname)) return url.pathname.replace(/\/$/, "");
	} catch {
		return null;
	}
	return null;
}
