import { expect, test } from "vitest";
import { formatTokens, parseTokens } from "./provider-token-units.ts";

test("K, M and plain counts all read as one integer", () => {
	expect(parseTokens("1M")).toBe(1_000_000);
	expect(parseTokens("1.5m")).toBe(1_500_000);
	expect(parseTokens("200K")).toBe(200_000);
	expect(parseTokens("128000")).toBe(128_000);
	expect(parseTokens("1,000,000 tokens")).toBe(1_000_000);
});

test("anything that is not a positive count is refused", () => {
	for (const bad of ["", "abc", "0", "-5", "1G", "1M2"]) expect(parseTokens(bad)).toBeNull();
});

test("a number is shown with the unit that spells it exactly", () => {
	expect(formatTokens(1_000_000)).toBe("1M");
	expect(formatTokens(1_500_000)).toBe("1.5M");
	expect(formatTokens(64_000)).toBe("64K");
	expect(formatTokens(1_048_576)).toBe("1048576");
	expect(formatTokens(512)).toBe("512");
});
