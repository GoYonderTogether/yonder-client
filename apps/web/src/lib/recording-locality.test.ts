import { describe, expect, it } from "vitest";
import { normalizeRecordingLocality } from "./recording-locality.ts";

describe("recording locality", () => {
	it("keeps normalized multilingual city labels", () => {
		expect(normalizeRecordingLocality(" 武汉 ")).toBe("武汉");
		expect(normalizeRecordingLocality("Sa\u0303o  Paulo")).toBe("São Paulo");
		expect(normalizeRecordingLocality("Neuilly-sur-Seine")).toBe("Neuilly-sur-Seine");
		expect(normalizeRecordingLocality("Xi’an")).toBe("Xi’an");
	});

	it("omits unavailable, coordinate-like, multiline and long values", () => {
		for (const input of [undefined, "", "30.59, 114.30", "12 High Street", "City\nStreet", "市".repeat(49)]) {
			expect(normalizeRecordingLocality(input)).toBeUndefined();
		}
	});
});
