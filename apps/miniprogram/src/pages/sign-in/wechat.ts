export function wechatGate(
	busy: boolean,
	agreed: boolean,
	native: boolean,
): "busy" | "terms" | "unavailable" | "ready" {
	if (busy) return "busy";
	if (!agreed) return "terms";
	return native ? "ready" : "unavailable";
}

export function phoneGate(
	busy: boolean,
	agreed: boolean,
	code: string | undefined,
	expires: number,
	now: number,
): "busy" | "terms" | "declined" | "expired" | "ready" {
	if (busy) return "busy";
	if (!agreed) return "terms";
	if (!code) return "declined";
	return now >= expires ? "expired" : "ready";
}

export function wechatErrorKind(error: unknown): "conflict" | "expired" | "unavailable" {
	const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
	if (code === "wechat_conflict") return "conflict";
	if (code === "code_expired") return "expired";
	return "unavailable";
}

export function smsGate(
	busy: boolean,
	agreed: boolean,
	seconds: number,
	valid: boolean,
): "busy" | "terms" | "invalid" | "ready" {
	if (busy || seconds > 0) return "busy";
	if (!agreed) return "terms";
	return valid ? "ready" : "invalid";
}
