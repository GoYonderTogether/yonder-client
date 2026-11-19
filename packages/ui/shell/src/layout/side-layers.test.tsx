// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AppShell } from "./app-shell.tsx";
import { ListFrame, PageFrame } from "./frames.tsx";
import type { SideStack } from "./side-layers.tsx";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function shell(width: number, side: SideStack | undefined, onBack = vi.fn(), desktop = width > 640) {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width, height: 800 } as DOMRect);
	return (
		<AppShell
			tab={{
				current: "messages",
				onSelect: vi.fn(),
				labels: { messages: "Messages", tasks: "Tasks", memory: "Memory" },
				ariaLabel: "Tabs",
			}}
			renderAvatar={() => <span>avatar</span>}
			personName="Name"
			meLabel="Me"
			settingsLabel="Settings"
			onOpenMe={vi.fn()}
			meOpen={false}
			side={side}
			desktop={desktop}
			onBack={onBack}
			backLabel="Back"
			list={<ListFrame title="Chats">chat list</ListFrame>}
			content={<PageFrame title="Chat">chat</PageFrame>}
			detailOpen
			composer={null}
			titlebarInset={false}
			brand={null}
			labels={{ showList: "Show list", hideList: "Hide list", resizeList: "Resize list" }}
			locationKey="/messages/main"
		/>
	);
}

function stack(titles: string[], onBack = vi.fn(), onClose = vi.fn()): SideStack {
	return {
		pages: titles.map((title) => ({ key: title, title, content: <p>{title} body</p> })),
		onBack,
		onClose,
		backLabel: "Back",
		closeLabel: "Close",
	};
}

test("the side panel is the top layer: Escape leaves it before the chat", () => {
	const side = stack(["Group info"]);
	const frameBack = vi.fn();
	render(shell(1280, side, frameBack));
	const panel = screen.getByRole("dialog", { name: "Group info" });
	expect(panel).toHaveAttribute("data-page-layer", "side");
	expect(panel).toHaveAttribute("data-page-side", "right");
	fireEvent.keyDown(window, { key: "Escape" });
	expect(side.onBack).toHaveBeenCalledTimes(1);
	expect(frameBack).not.toHaveBeenCalled();
});

test.each([600, 1280])("a %ipx desktop window closes its drawer with × or a click beside it", (width) => {
	const side = stack(["Bot"]);
	render(shell(width, side, vi.fn(), true));
	expect(screen.getByRole("dialog", { name: "Bot" }).className).toContain("w-[var(--side-panel-width)]");
	fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1) as HTMLElement);
	expect(side.onClose).toHaveBeenCalledTimes(1);
	fireEvent.click(document.querySelector("[data-side-scrim]") as HTMLElement);
	expect(side.onClose).toHaveBeenCalledTimes(2);
});

test("on a phone the panel covers the chat, and a stacked page goes back to the one under it", () => {
	const side = stack(["Group info", "Card"]);
	render(shell(390, side));
	expect(screen.getByRole("dialog", { name: "Group info" }).className).not.toContain("side-panel-width");
	const card = screen.getByRole("dialog", { name: "Card" });
	expect(card).toHaveAttribute("data-page-layer", "side:Card");
	expect(card).toHaveAttribute("data-page-side", "right");
	expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
	fireEvent.click(card.querySelector("header button") as HTMLElement);
	fireEvent.keyDown(window, { key: "Escape" });
	expect(side.onBack).toHaveBeenCalledTimes(2);
	// The chat under the panel cannot be reached while the panel is open.
	expect(document.querySelector('[data-page-layer="detail"]')).toHaveAttribute("inert");
});

test("no pages means no panel", () => {
	render(shell(1280, stack([])));
	expect(document.querySelector('[data-page-layer="side"]')).toBeNull();
});
