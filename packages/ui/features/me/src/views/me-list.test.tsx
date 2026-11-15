// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { MeList } from "./me-list.tsx";

const chrome = vi.hoisted(() => ({ mode: "wide" }));
vi.mock("@yonder/ui-data", () => ({
	useMe: () => ({ data: { member: { displayName: "A person", handle: "person" } } }),
}));
vi.mock("@yonder/ui-shell", async (original) => ({
	...(await original<typeof import("@yonder/ui-shell")>()),
	useShellChrome: () => chrome,
}));

function show(mode: string) {
	chrome.mode = mode;
	const open = vi.fn();
	const view = render(
		<I18nextProvider i18n={createI18n("en")}>
			<MeList current="models" onOpen={open} />
		</I18nextProvider>,
	);
	return { ...view, open };
}

test.each(["wide", "compact"])(
	"desktop %s uses compact flat settings navigation with grey selection and keyboard activation",
	async (mode) => {
		const { container, open } = show(mode);
		const models = screen.getByRole("button", { name: "Models" });
		expect(screen.getByRole("navigation", { name: "Me" })).toBeVisible();
		expect(models).toHaveAttribute("aria-current", "page");
		expect(models).toHaveClass(
			"bg-[var(--color-bg-selected)]",
			"rounded-[var(--radius-control-sm)]",
			"focus-visible:outline-2",
			"py-[var(--spacing-1)]",
		);
		expect(models.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
		expect(models.querySelectorAll("svg")).toHaveLength(1);
		expect(models.querySelector("svg")?.parentElement).toBe(models);
		expect(container.querySelectorAll(".bg-\\[var\\(--color-bg-surface\\)\\]")).toHaveLength(0);
		expect(container.querySelectorAll(".group\\/row")).toHaveLength(0);
		models.focus();
		await userEvent.keyboard("{Enter}");
		expect(open).toHaveBeenCalledWith("models");
		fireEvent.click(screen.getByRole("button", { name: "Skills" }));
		expect(open).toHaveBeenCalledWith("skills");
	},
);

test("mobile keeps grouped cards, icon tiles, row chevrons and selection", () => {
	const { container } = show("mobile");
	const models = screen.getByRole("button", { name: "Models" });
	expect(models).toHaveAttribute("aria-current", "true");
	expect(models.querySelectorAll("svg")).toHaveLength(2);
	expect(models.querySelector("svg")?.parentElement?.tagName).toBe("SPAN");
	expect(container.querySelectorAll(".group\\/row").length).toBeGreaterThan(0);
	expect(screen.queryByRole("navigation", { name: "Me" })).toBeNull();
});
