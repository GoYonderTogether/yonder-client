/** Read only the expiry claim. The access token itself must never be rendered or logged. */
export function accessTokenExpiry(token: string | null): number | null {
	const payload = token?.split(".")[1];
	if (!payload) return null;
	try {
		const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
		return typeof claims.exp === "number" && Number.isFinite(claims.exp) ? claims.exp * 1_000 : null;
	} catch {
		return null;
	}
}
