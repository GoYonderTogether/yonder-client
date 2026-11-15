export function resolveApiBase(input = "https://yonder.zethai.cn"): string {
	const url = new URL(input.trim() || "https://yonder.zethai.cn");
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
	if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
		throw new Error("A custom Yonder server must use HTTPS, except HTTP on loopback.");
	}
	if (url.username || url.password || url.search || url.hash) {
		throw new Error("The Yonder server address cannot contain credentials, query or hash.");
	}
	return url.origin + url.pathname.replace(/\/+$/, "");
}
