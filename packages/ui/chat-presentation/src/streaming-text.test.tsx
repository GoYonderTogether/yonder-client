// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";

test("keeps the whole text intact if grapheme segmentation is unavailable", async () => {
	vi.resetModules();
	vi.stubGlobal("Intl", Object.assign(Object.create(Intl), { Segmenter: undefined }));
	try {
		const { StreamingText } = await import("./streaming-text.tsx");
		const text = "👨‍👩‍👧‍👦 é";
		const { container } = render(<StreamingText as="span" text={text} />);
		expect(container.textContent).toBe(text);
		expect(container.querySelectorAll(".stream-character")).toHaveLength(0);
	} finally {
		vi.unstubAllGlobals();
		vi.resetModules();
	}
});

test("shows text intact when Intl is entirely unavailable", async () => {
	vi.resetModules();
	vi.stubGlobal("Intl", undefined);
	try {
		const { StreamingText } = await import("./streaming-text.tsx");
		expect(StreamingText({ as: "span", text: "👨‍👩‍👧‍👦 é" })).toBe("👨‍👩‍👧‍👦 é");
	} finally {
		vi.unstubAllGlobals();
		vi.resetModules();
	}
});
