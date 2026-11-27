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
				labels: { messages: "Messages", tasks: "Tasks", memory: "Memory", contacts: "Contacts" },
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
		tabs: titles.length
			? [
					{
						key: titles[0] ?? "",
						pages: titles.map((title) => ({ key: title, title, content: <p>{title} body</p> })),
					},
				]
			: [],
		active: titles[0] ?? null,
		expanded: titles.length > 0,
		onActivate: vi.fn(),
		onMove: vi.fn(),
		onBack,
		onClose,
		onCloseAll: vi.fn(),
		onCollapse: vi.fn(),
		labels: {
			pane: "Details",
			back: "Back",
			close: "Close",
			closeTab: (title) => `Close ${title}`,
			closeAll: "Close all details",
			collapse: "Collapse details",
			expand: "Expand details",
			resize: "Resize details",
		},
	};
}

test("wide desktop shows a tabbed region beside a live chat with three distinct close actions", () => {
	const side = stack(["Bot"]);
	render(shell(1280, side));
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(screen.getByRole("tab", { name: "Bot" })).toHaveAttribute("aria-selected", "true");
	expect(document.querySelector('[data-page-layer="detail"]')).not.toHaveAttribute("inert");
	fireEvent.click(screen.getByRole("button", { name: "Close Bot" }));
	fireEvent.click(screen.getByRole("button", { name: "Close all details" }));
	fireEvent.click(screen.getByRole("button", { name: "Collapse details" }));
	expect(side.onClose).toHaveBeenCalledWith("Bot");
	expect(side.onCloseAll).toHaveBeenCalledTimes(1);
	expect(side.onCollapse).toHaveBeenCalledTimes(1);
});

test.each([390, 844])("a %ipx mobile host presents one detail with Back, independent of orientation", (width) => {
	const side = stack(["Group info", "Card"]);
	render(shell(width, side, vi.fn(), false));
	expect(screen.queryByRole("dialog", { name: "Group info" })).toBeNull();
	const card = screen.getByRole("dialog", { name: "Card" });
	expect(card).toHaveAttribute("data-page-layer", "side");
	expect(card).toHaveAttribute("data-page-side", "right");
	expect(screen.queryByRole("tab")).toBeNull();
	expect(screen.queryByRole("button", { name: "Close all details" })).toBeNull();
	fireEvent.click(card.querySelector("header button") as HTMLElement);
	fireEvent.keyDown(window, { key: "Escape" });
	expect(side.onBack).toHaveBeenCalledTimes(2);
	// The chat under the panel cannot be reached while the panel is open.
	expect(document.querySelector('[data-page-layer="detail"]')).toHaveAttribute("inert");
});

test("no pages means no panel", () => {
	render(shell(1280, stack([])));
	expect(screen.queryByRole("tablist", { name: "Details" })).toBeNull();
});
