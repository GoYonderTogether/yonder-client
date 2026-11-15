// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { MeSectionId } from "@yonder/feature-me";
import { createMemoryStorage } from "@yonder/ui-data";
import { expect, test } from "vitest";
import { useMeEntry } from "./use-me-entry.ts";

test("defaults to profile and remembers each account's last section across mounts", () => {
	const storage = createMemoryStorage();
	const initialProps: { person: string; section: MeSectionId | null } = { person: "alice", section: null };
	const first = renderHook(
		({ person, section }: { person: string; section: MeSectionId | null }) => useMeEntry(storage, person, section),
		{ initialProps },
	);
	expect(first.result.current).toBe("/me/profile");
	first.rerender({ person: "alice", section: "account" });
	first.rerender({ person: "bob", section: null });
	expect(first.result.current).toBe("/me/profile");
	first.rerender({ person: "bob", section: "about" });
	first.unmount();
	const restored = renderHook(() => useMeEntry(storage, "alice", null));
	expect(restored.result.current).toBe("/me/account");
	expect(storage.get("me-section.bob")).toBe("about");
	const otherDevice = renderHook(() => useMeEntry(createMemoryStorage(), "alice", null));
	expect(otherDevice.result.current).toBe("/me/profile");
});

test("unknown or nested stored pages fall back to profile", () => {
	const storage = createMemoryStorage();
	for (const value of ["removed-section", "account/password", "models/add"]) {
		storage.set("me-section.alice", value);
		const view = renderHook(() => useMeEntry(storage, "alice", null));
		expect(view.result.current).toBe("/me/profile");
		view.unmount();
	}
});
