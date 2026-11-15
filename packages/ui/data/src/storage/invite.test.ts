import { afterEach, expect, test, vi } from "vitest";
import { createMemoryStorage } from "./index.ts";
import { clearInvite, readInvite, saveInvite } from "./invite.ts";

afterEach(() => vi.useRealTimers());

test("an invitation can be removed and expires after 30 days", () => {
	vi.useFakeTimers();
	const storage = createMemoryStorage();
	saveInvite(storage, "invite-code");
	expect(readInvite(storage)).toBe("invite-code");
	vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1000);
	expect(readInvite(storage)).toBeNull();
	expect(storage.get("invite")).toBeNull();
	saveInvite(storage, "another-code");
	clearInvite(storage);
	expect(readInvite(storage)).toBeNull();
});
