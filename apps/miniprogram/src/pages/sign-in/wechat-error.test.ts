import { expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ locale: "zh" }));
vi.mock("../../lib/i18n", () => ({ t: (zh: string, en: string) => (state.locale === "zh" ? zh : en) }));

import { authFailure } from "./wechat-error";

test("operation failures are localized for both supported languages", () => {
	for (const operation of ["send", "sign-in", "reset", "profile"] as const) {
		state.locale = "zh";
		expect(authFailure(operation)).toMatch(/[\u4e00-\u9fff]/);
		state.locale = "en";
		expect(authFailure(operation)).toMatch(/^[A-Za-z]/);
	}
});
