// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AmbientField, DEFAULT_VEIL } from "./ambient-field.tsx";

// jsdom has no WebGL and no matchMedia; the vendored components fall back to a flat colour then.
beforeEach(() => {
	vi.stubGlobal("matchMedia", () => ({
		matches: false,
		addEventListener: () => {},
		removeEventListener: () => {},
	}));
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	HTMLCanvasElement.prototype.getContext = (() => null) as never;
	document.documentElement.dataset.theme = "light";
});
afterEach(() => {
	vi.unstubAllGlobals();
	delete document.documentElement.dataset.theme;
});

describe("AmbientField", () => {
	test("draws nothing where the browser lacks the APIs the effects need", () => {
		vi.stubGlobal("matchMedia", undefined);
		const { container } = render(<AmbientField />);
		expect(container).toBeEmptyDOMElement();
	});

	test("is hidden from assistive technology and lays the day veil over the light", () => {
		const { container } = render(<AmbientField />);
		const field = container.firstElementChild as HTMLElement;
		expect(field).toHaveAttribute("aria-hidden", "true");
		expect(field.style.getPropertyValue("--ambient-veil")).toBe(String(DEFAULT_VEIL.light));
	});

	test("follows the theme: a dark page switches to the night veil", async () => {
		const { container } = render(<AmbientField />);
		await act(async () => {
			document.documentElement.dataset.theme = "dark";
			await Promise.resolve();
		});
		const field = container.firstElementChild as HTMLElement;
		expect(field.style.getPropertyValue("--ambient-veil")).toBe(String(DEFAULT_VEIL.dark));
	});

	test("takes a custom veil per theme", () => {
		const { container } = render(<AmbientField veil={{ light: 0.5, dark: 0.2 }} />);
		expect((container.firstElementChild as HTMLElement).style.getPropertyValue("--ambient-veil")).toBe("0.5");
	});
});
