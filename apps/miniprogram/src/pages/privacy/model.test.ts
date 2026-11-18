import { describe, expect, it } from "vitest";
import { confirmed, optimistic, PRIVACY_DEFAULTS, reverted, shown } from "./model";

describe("privacy switches", () => {
	it("starts every switch on when the server has no row yet", () => {
		expect(shown({}, undefined, "searchable")).toBe(true);
		expect(shown({}, undefined, "cardPublicLink")).toBe(true);
		expect(PRIVACY_DEFAULTS).toEqual({ searchable: true, cardForUsers: true, cardPublicLink: true });
	});
	it("shows the last confirmed value until a switch is touched", () => {
		expect(shown({}, { ...PRIVACY_DEFAULTS, searchable: false }, "searchable")).toBe(false);
		expect(shown({ searchable: true }, { ...PRIVACY_DEFAULTS, searchable: false }, "searchable")).toBe(true);
	});
	it("puts only the failed switch back, keeping the others as they are", () => {
		const edited = optimistic(optimistic({}, "searchable", false), "cardForUsers", false);
		expect(edited).toEqual({ searchable: false, cardForUsers: false });
		expect(reverted(edited, "searchable", true)).toEqual({ searchable: true, cardForUsers: false });
	});
	it("takes the whole record the server confirms", () => {
		const saved = { searchable: false, cardForUsers: true, cardPublicLink: false };
		expect(confirmed({ searchable: false }, saved)).toEqual(saved);
	});
});
