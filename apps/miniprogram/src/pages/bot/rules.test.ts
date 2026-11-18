import { ApiError } from "@yonder/api-client";
import type { Member } from "@yonder/protocol";
import { expect, test, vi } from "vitest";

vi.mock("@tarojs/taro", () => ({
	default: { getStorageSync: () => "en", getSystemInfoSync: () => ({ language: "en" }), setStorageSync: () => {} },
}));

import {
	BOT_COLORS,
	BOT_NAME_MAX,
	botChanges,
	botFailure,
	canDelete,
	colorOf,
	deleteMessage,
	hasChanges,
	nameProblem,
} from "./rules";

const bot = (overrides: Partial<Member> = {}): Member => ({
	id: "bot_1",
	kind: "bot",
	handle: "abc123xyz",
	displayName: "Yonder",
	avatarUrl: null,
	avatarColor: "2",
	bio: null,
	ownerId: "mem_1",
	isDefault: false,
	createdAt: "2026-01-01T00:00:00.000Z",
	version: 1,
	...overrides,
});

test("a name is required and counted by code points, not UTF-16 units", () => {
	expect(nameProblem("   ")).toBe("A name is required");
	expect(nameProblem("a".repeat(BOT_NAME_MAX))).toBeNull();
	expect(nameProblem("a".repeat(BOT_NAME_MAX + 1))).toBe("A name can be at most 40 characters");
	// One emoji is one character even though it is two UTF-16 units.
	expect(nameProblem("😀".repeat(BOT_NAME_MAX))).toBeNull();
	expect(nameProblem("😀".repeat(BOT_NAME_MAX + 1))).toBe("A name can be at most 40 characters");
});

test("only the fields that differ are sent, and a name keeps its inner spaces", () => {
	expect(botChanges(bot(), "Yonder", "2")).toEqual({});
	expect(hasChanges(botChanges(bot(), "Yonder", "2"))).toBe(false);
	expect(botChanges(bot(), "  Second  ", "2")).toEqual({ displayName: "Second" });
	expect(botChanges(bot(), "Yonder", "5")).toEqual({ avatarColor: "5" });
	expect(botChanges(bot(), "Second", "5")).toEqual({ displayName: "Second", avatarColor: "5" });
	// An invalid name is not sent for the server to refuse; the page shows the reason itself.
	expect(botChanges(bot(), " ".repeat(3), "9")).toEqual({});
});

test("a Bot with no colour is drawn in the first one, and a colour outside 1–6 is never offered", () => {
	expect(colorOf({ avatarColor: null })).toBe(BOT_COLORS[0]);
	expect(colorOf({})).toBe(BOT_COLORS[0]);
	expect(colorOf({ avatarColor: "7" })).toBe(BOT_COLORS[0]);
	expect(colorOf({ avatarColor: "4" })).toBe("4");
	// Picking a colour the Bot does not have is a change; picking the one it has is not.
	expect(botChanges(bot({ avatarColor: null }), "Yonder", "1")).toEqual({});
});

test("the default Bot has no delete button; every other Bot does", () => {
	expect(canDelete(bot({ isDefault: true }))).toBe(false);
	expect(canDelete(bot({ isDefault: false }))).toBe(true);
});

test("the delete confirmation states the plans going with it and that history stays on the server", () => {
	expect(deleteMessage(0)).not.toContain("scheduled plan");
	expect(deleteMessage(0)).toContain("the history stays on the server");
	expect(deleteMessage(1)).toContain("Its 1 scheduled plan");
	expect(deleteMessage(3)).toContain("Its 3 scheduled plans");
	expect(deleteMessage(null)).toContain("Its scheduled plans");
	expect(deleteMessage(3)).not.toContain("deleted for good");
});

test("a refusal is explained by the server's code, and an unknown code keeps the server's message", () => {
	const failure = (code: string, message = "developer message") =>
		new ApiError({ code: code as never, status: 400, message });
	expect(botFailure(failure("default_bot_protected"))).toBe("The default bot cannot be deleted");
	expect(botFailure(failure("rate_limited"))).toBe("Too many attempts. Try again later");
	expect(botFailure(failure("upload_invalid"))).toBe("That file cannot be used as an avatar");
	expect(botFailure(failure("not_found"))).toBe("This bot is gone");
	expect(botFailure(failure("invalid_request"))).toContain("40 characters");
	// Never a friendlier line than the server's, and never a made-up one.
	expect(botFailure(failure("upstream_unavailable", "the provider rejected it"))).toBe("the provider rejected it");
	expect(botFailure(new TypeError("offline"))).toBe("Could not reach the server. Check your connection.");
});
