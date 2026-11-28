export function wechatGate(busy: boolean, native: boolean): "busy" | "unavailable" | "ready" {
	if (busy) return "busy";
	return native ? "ready" : "unavailable";
}

export function phoneGate(
	busy: boolean,
	code: string | undefined,
	expires: number,
	now: number,
): "busy" | "declined" | "expired" | "ready" {
	if (busy) return "busy";
	if (!code) return "declined";
	return now >= expires ? "expired" : "ready";
}

export function wechatErrorKind(error: unknown): "conflict" | "expired" | "unavailable" {
	const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
	if (code === "wechat_conflict") return "conflict";
	if (code === "code_expired") return "expired";
	return "unavailable";
}

export function smsGate(busy: boolean, seconds: number, valid: boolean): "busy" | "invalid" | "ready" {
	if (busy || seconds > 0) return "busy";
	return valid ? "ready" : "invalid";
}
