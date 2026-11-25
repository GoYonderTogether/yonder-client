import { expect, test } from "vitest";
import { affectsMemory } from "./realtime";

test("memory updates refresh the timeline and matching file independently", () => {
	const event = { type: "memory.changed", eventId: "event", at: "2026-11-18T00:00:00Z" } as const;
	expect(affectsMemory({ ...event, dates: ["2026-11-18"] })).toBe(true);
	expect(affectsMemory({ ...event, dates: ["2026-11-18"] }, "/me/impression.md")).toBe(false);
	expect(affectsMemory({ ...event, paths: ["/me/recent.md"] })).toBe(false);
	expect(affectsMemory({ ...event, paths: ["/me/recent.md"] }, "/me/impression.md")).toBe(false);
	expect(affectsMemory({ ...event, paths: ["/me/recent.md"] }, "/me/recent.md")).toBe(true);
	expect(affectsMemory(event, "/me/recent.md")).toBe(true);
});
