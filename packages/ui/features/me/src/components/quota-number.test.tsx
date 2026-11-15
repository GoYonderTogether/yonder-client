import { expect, test } from "vitest";
import { formatCompact, formatExact } from "./quota-number.tsx";

test("quota values use the requested language, signs and exact values", () => {
	expect(formatCompact(1_200_000, "zh-CN")).toBe("120 万");
	expect(formatCompact(1_200_000, "en")).toBe("1.2M");
	expect(formatCompact(-15_000, "zh-CN", true)).toBe("-1.5 万");
	expect(formatExact(1_200_000, "en")).toBe("1,200,000");
	expect(formatCompact(10_000, "en")).toBe("10,000");
});
