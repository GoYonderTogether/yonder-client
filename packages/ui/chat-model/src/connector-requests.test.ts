import { expect, test } from "vitest";
import { connectorRequestReason } from "./connector-requests.ts";

test("keeps the first authorization reason sentence and preserves decimal points and extensions", () => {
	expect(connectorRequestReason("  为了  查找计划。请勿显示这句。  ")).toBe("为了 查找计划");
	expect(connectorRequestReason("To read  plan.md v1.5. Leave this out.")).toBe("To read plan.md v1.5");
	expect(connectorRequestReason("First reason\nSecond reason")).toBe("First reason");
	expect(connectorRequestReason(undefined)).toBe("");
});
