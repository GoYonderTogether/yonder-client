export function connectorRequestReason(reason?: string | null): string {
	// A period within a decimal or filename is not a sentence break.
	const first = reason?.trim().split(/[。！？；!?;\r\n]+|\.+(?=\s|$)/u, 1)[0] ?? "";
	return first
		.replace(/\s+/gu, " ")
		.replace(/[,，:：]+$/u, "")
		.trim();
}
