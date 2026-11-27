import type { InviteRequiredResponse } from "@yonder/protocol";

const KEY = "yonder.invite-verification";

// A tab-scoped proof allows a verified user to open a new invitation or refresh this page.
export function readInviteVerification(): string | null {
	try {
		const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
		if (typeof value?.ticket === "string" && value.expiresAt > Date.now()) return value.ticket;
		sessionStorage.removeItem(KEY);
	} catch {
		// The active form still works if the browser disallows session storage.
	}
	return null;
}

export function storeInviteVerification(value: InviteRequiredResponse | null) {
	try {
		if (value) {
			sessionStorage.setItem(
				KEY,
				JSON.stringify({ ticket: value.ticket, expiresAt: Date.now() + value.expiresIn * 1000 }),
			);
		} else sessionStorage.removeItem(KEY);
	} catch {
		// An active proof is also kept in memory until the form leaves the page.
	}
}
