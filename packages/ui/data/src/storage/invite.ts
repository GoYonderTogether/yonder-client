import type { Storage } from "./index.ts";

const KEY = "invite";
const LIFETIME = 30 * 24 * 60 * 60 * 1000;

export function saveInvite(storage: Storage, code: string): void {
	storage.set(KEY, JSON.stringify({ code, expiresAt: Date.now() + LIFETIME }));
}

export function readInvite(storage: Storage): string | null {
	const raw = storage.get(KEY);
	if (!raw) return null;
	try {
		const invite: unknown = JSON.parse(raw);
		if (
			invite &&
			typeof invite === "object" &&
			"code" in invite &&
			typeof invite.code === "string" &&
			invite.code.length > 0 &&
			"expiresAt" in invite &&
			typeof invite.expiresAt === "number" &&
			invite.expiresAt > Date.now()
		) {
			return invite.code;
		}
	} catch {
		// An invalid stored value cannot be used as an invitation.
	}
	storage.remove(KEY);
	return null;
}

export function clearInvite(storage: Storage): void {
	storage.remove(KEY);
}
