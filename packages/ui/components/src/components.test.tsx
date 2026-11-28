// @vitest-environment jsdom
/**
 * Layer two's primitives: the states a unit test can hold — the avatar's fallback, the button's
 * loading state, and the empty state's structure.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { Avatar, BOT_FACE_IDS, Button, botFaceFor, EmptyState, Logo } from "@yonder/ui-components";
import { describe, expect, test } from "vitest";

describe("Avatar", () => {
	test("shows the first character of the name when there is no image", () => {
		render(<Avatar name="Aster" />);
		expect(screen.getByText("A")).toBeInTheDocument();
	});

	test("keeps the initial while an avatar is pending or fails, and shows a loaded replacement", () => {
		const { container, rerender } = render(<Avatar name="Aster" src="https://example.test/a.png?v=abc" />);
		const image = container.querySelector("img");
		if (!image) throw new Error("Expected an avatar image");
		expect(image.getAttribute("src")).toBe("https://example.test/a.png?v=abc");
		// The name is the accessible label on the surrounding control, not on the image itself.
		expect(image.getAttribute("alt")).toBe("");
		expect(screen.getByText("A")).toBeInTheDocument();
		expect(image).toHaveClass("opacity-0");
		fireEvent.error(image);
		expect(screen.getByText("A")).toBeInTheDocument();
		expect(container.querySelector("img")).toBe(image);

		rerender(<Avatar name="Aster" src="https://example.test/a.png?v=def" />);
		const replacement = container.querySelector("img");
		if (!replacement) throw new Error("Expected a replacement avatar image");
		expect(replacement).toHaveAttribute("src", "https://example.test/a.png?v=def");
		expect(screen.getByText("A")).toBeInTheDocument();
		fireEvent.load(replacement);
		expect(screen.queryByText("A")).not.toBeInTheDocument();
		expect(replacement).not.toHaveClass("opacity-0");
	});

	test("shows the Bot face instead of an initial for a Bot without an image", () => {
		const { container } = render(<Avatar name="Aster" kind="bot" size={48} />);
		expect(container.querySelector("[data-bot-face='1']")).toHaveAttribute("aria-hidden", "true");
		expect(container.querySelectorAll("[data-bot-face] path")).toHaveLength(2);
		expect(screen.queryByText("A")).not.toBeInTheDocument();
	});

	test("draws the face a Bot asks for, and the same key always picks the same face", () => {
		const { container } = render(<Avatar name="Aster" kind="bot" face={4} />);
		expect(container.querySelector("[data-bot-face='4']")).toBeInTheDocument();
		expect(botFaceFor("bot-123")).toBe(botFaceFor("bot-123"));
		expect(BOT_FACE_IDS).toContain(botFaceFor("another"));
	});

	test("keeps a Bot's supplied image", () => {
		const { container } = render(<Avatar name="Aster" kind="bot" src="https://example.test/bot.png" />);
		const image = container.querySelector("img");
		if (!image) throw new Error("Expected a Bot avatar image");
		expect(image).toHaveAttribute("src", "https://example.test/bot.png");
		expect(container.querySelector("[data-bot-face]")).toBeInTheDocument();
		fireEvent.load(image);
		expect(container.querySelector("svg")).not.toBeInTheDocument();
	});

	test("a name with no characters falls back to a question mark", () => {
		render(<Avatar name="   " />);
		expect(screen.getByText("?")).toBeInTheDocument();
	});
});

describe("Logo", () => {
	test("is decorative by default", () => {
		const { container } = render(<Logo size={32} />);
		expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
		expect(container.querySelector("svg")).toHaveAttribute("width", "32");
	});

	test("is labelled when given a title", () => {
		render(<Logo size={32} title="Product logo" />);
		expect(screen.getByRole("img", { name: "Product logo" })).not.toHaveAttribute("aria-hidden");
	});
});

describe("Button", () => {
	test("is disabled and busy while loading", () => {
		render(<Button loading>Save</Button>);
		const button = screen.getByRole("button", { name: /Save/ });
		expect(button).toBeDisabled();
		expect(button).toHaveAttribute("aria-busy", "true");
	});

	test("keeps its label while loading, so the width does not jump", () => {
		const { container } = render(<Button loading>Save</Button>);
		// The spinner and the label: the label stays in the layout rather than being replaced.
		expect(container.querySelectorAll("span")).toHaveLength(2);
	});
});

describe("EmptyState", () => {
	test("always has a title and an optional sentence", () => {
		render(<EmptyState title="No tasks yet" body="When you ask the Bot to do something, it appears here." />);
		expect(screen.getByRole("heading", { name: "No tasks yet" })).toBeInTheDocument();
		expect(screen.getByText(/When you ask the Bot/)).toBeInTheDocument();
	});
});
