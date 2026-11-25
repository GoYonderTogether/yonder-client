import { describe, expect, test } from "vitest";
import {
	appendedSince,
	distanceToEnd,
	isAtEnd,
	isLatestAway,
	isOwnMessage,
	READ_END_DISTANCE,
	STICK_DISTANCE,
} from "./message-scroll-rules.ts";

const metrics = (scrollTop: number, scrollHeight = 1000, clientHeight = 200) => ({
	scrollHeight,
	clientHeight,
	scrollTop,
});

describe("stick to the end", () => {
	test("the end is within 48px, so late images and rounded layout keep the reader there", () => {
		expect(STICK_DISTANCE).toBe(48);
		expect(distanceToEnd(metrics(800))).toBe(0);
		expect(isAtEnd(metrics(800))).toBe(true);
		expect(isAtEnd(metrics(752))).toBe(true);
		expect(isAtEnd(metrics(751))).toBe(false);
	});

	test("a fractional scrollTop still counts as the end", () => {
		expect(isAtEnd(metrics(799.5))).toBe(true);
	});

	test("an empty viewport is never at the end", () => {
		expect(isAtEnd({ scrollHeight: 0, clientHeight: 0, scrollTop: 0 })).toBe(false);
	});

	test("reading the latest still needs the very end", () => {
		expect(isAtEnd(metrics(800), READ_END_DISTANCE)).toBe(true);
		expect(isAtEnd(metrics(770), READ_END_DISTANCE)).toBe(false);
	});

	test("the return button appears only after 120px away", () => {
		expect(isLatestAway(metrics(680))).toBe(false);
		expect(isLatestAway(metrics(679))).toBe(true);
	});
});

describe("own messages", () => {
	const own = { id: "temp_nonce", senderId: "me" };
	test("an optimistic or saved message from the reader is their own", () => {
		expect(isOwnMessage(own, "me")).toBe(true);
		expect(isOwnMessage({ id: "sent-1", senderId: "me" }, "me")).toBe(true);
	});

	test("an optimistic message is the reader's own even before the account has loaded", () => {
		expect(isOwnMessage(own, undefined)).toBe(true);
	});

	test("the server's copy replacing the optimistic one is not another send", () => {
		expect(isOwnMessage({ id: "sent-1", senderId: "me" }, "me", "temp_nonce")).toBe(false);
	});

	test("someone else's message or an unknown sender is not", () => {
		expect(isOwnMessage({ id: "m", senderId: "other" }, "me")).toBe(false);
		expect(isOwnMessage({ id: "m" }, "me")).toBe(false);
		expect(isOwnMessage(undefined, "me")).toBe(false);
	});
});

describe("counting what arrived while away", () => {
	const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
	test("counts only the messages after the last one seen", () => {
		expect(appendedSince(items, "b")).toBe(2);
		expect(appendedSince(items, "d")).toBe(0);
	});

	test("a last id that is gone means nothing was appended by this render", () => {
		expect(appendedSince(items, "removed")).toBe(0);
	});

	test("with no previous render every message is new", () => {
		expect(appendedSince(items, "")).toBe(4);
	});
});
