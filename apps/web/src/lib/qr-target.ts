/** QR contents are data, never arbitrary navigation or code. */
export function qrTarget(value: string, origin: string): string | null {
	const text = value.trim();
	const handle = /^@?([a-z][a-z0-9_-]{4,18}[a-z0-9])$/i;
	const validHandle = (name: string) => handle.test(name) && !/[_-]{2}/.test(name);
	if (/^\+?\d{6,15}$/.test(text)) return text;
	if (validHandle(text)) return `@${text.replace(/^@/, "").toLowerCase()}`;
	try {
		const url = new URL(text, origin);
		if (url.origin !== new URL(origin).origin || url.username || url.password || url.hash) return null;
		const member = /^\/@([^/]+)\/?$/.exec(url.pathname)?.[1];
		if (member && validHandle(member)) return `@${member.toLowerCase()}`;
		if (/^\/i\/[A-Za-z0-9_-]{1,64}\/?$/.test(url.pathname)) return url.pathname.replace(/\/$/, "");
	} catch {
		return null;
	}
	return null;
}
