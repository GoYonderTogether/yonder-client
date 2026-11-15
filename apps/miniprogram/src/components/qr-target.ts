/** Parse Yonder QR data without a browser URL API or opening arbitrary URLs. */
export function qrTarget(value: string, baseUrl: string): string | null {
	const text = value.trim();
	const validHandle = (name: string) => /^@?[a-z][a-z0-9_-]{4,18}[a-z0-9]$/i.test(name) && !/[_-]{2}/.test(name);
	if (/^\+?\d{6,15}$/.test(text)) return text;
	if (validHandle(text)) return `@${text.replace(/^@/, "").toLowerCase()}`;
	if (text.includes("#")) return null;
	const origin = /^https?:\/\/[^/?#]+/i.exec(baseUrl)?.[0];
	if (!origin) return null;
	let path = text;
	if (/^https?:\/\//i.test(text)) {
		const incoming = /^https?:\/\/[^/?#]+/i.exec(text)?.[0];
		if (!incoming || incoming.toLowerCase() !== origin.toLowerCase()) return null;
		path = text.slice(incoming.length);
	}
	if (!path.startsWith("/") || path.startsWith("//")) return null;
	path = path.split("?")[0];
	const member = /^\/@([^/]+)\/?$/.exec(path)?.[1];
	if (member && validHandle(member)) return `@${member.toLowerCase()}`;
	if (/^\/i\/[A-Za-z0-9_-]{1,64}\/?$/.test(path)) return path.replace(/\/$/, "");
	return null;
}
