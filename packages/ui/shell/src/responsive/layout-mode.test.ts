import { describe, expect, test } from "vitest";
import {
	clampListPane,
	LIST_PANE_MAX,
	LIST_PANE_MIN,
	layoutMode,
	MOBILE_MAX_WIDTH,
	WIDE_MIN_WIDTH,
} from "./layout-mode.ts";

describe("layoutMode", () => {
	test("three columns from 1024 up", () => {
		expect(layoutMode(WIDE_MIN_WIDTH)).toBe("wide");
		expect(layoutMode(1440)).toBe("wide");
	});

	test("rail and content between 640 and 1023", () => {
		expect(layoutMode(1023.9)).toBe("medium");
		expect(layoutMode(MOBILE_MAX_WIDTH)).toBe("medium");
	});

	test("mobile below 640", () => {
		expect(layoutMode(MOBILE_MAX_WIDTH - 1)).toBe("mobile");
		expect(layoutMode(375)).toBe("mobile");
		expect(layoutMode(390)).toBe("mobile");
	});

	test("the desktop app's minimum window width (720) never becomes the phone layout", () => {
		expect(layoutMode(720)).not.toBe("mobile");
	});
});

describe("clampListPane", () => {
	test("keeps the list column inside its bounds", () => {
		expect(clampListPane(100)).toBe(LIST_PANE_MIN);
		expect(clampListPane(9999)).toBe(LIST_PANE_MAX);
		expect(clampListPane(300)).toBe(300);
	});
});
