import { expect, test } from "vitest";
import type { VersionPayload } from "./version-payload.ts";

test("a version payload carries only the release version", () => {
	const payload: VersionPayload = { version: "0.3.26111201" };
	expect(Object.keys(payload)).toEqual(["version"]);
	expect(payload.version).toMatch(/^0\.\d+\.\d{8}$/);
});
