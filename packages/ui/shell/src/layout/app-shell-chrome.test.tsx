// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { AppShellProps } from "./app-shell.tsx";
import { AppShell } from "./app-shell.tsx";
import { ListFrame, PageFrame } from "./frames.tsx";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const props: AppShellProps = {
	tab: {
		current: "messages",
		onSelect() {},
		labels: { messages: "Messages", tasks: "Tasks", memory: "Memory" },
		ariaLabel: "Tabs",
	},
	renderAvatar: () => null,
	personName: "Name",
	meLabel: "Me",
	settingsLabel: "Settings",
	onOpenMe() {},
	meOpen: false,
	onBack() {},
	backLabel: "Back",
	list: <ListFrame title="Messages">Conversation list</ListFrame>,
	content: <PageFrame title="Conversation">Conversation content</PageFrame>,
	detailOpen: false,
	composer: <textarea aria-label="Message" />,
	titlebarInset: false,
	brand: null,
	labels: { showList: "Show list", hideList: "Hide list", resizeList: "Resize list" },
	locationKey: "/messages",
};

function viewport(width: number) {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width } as DOMRect);
}

test("the real list/detail frames share one active mobile dock and one safe-area owner", () => {
	viewport(390);
	const { container, rerender } = render(<AppShell {...props} />);
	expect(container.querySelectorAll("[data-mobile-dock]")).toHaveLength(1);
	expect(screen.getByRole("navigation", { name: "Tabs" })).toBeInTheDocument();
	rerender(<AppShell {...props} detailOpen locationKey="/messages/conversation" />);
	const docks = container.querySelectorAll("[data-mobile-dock]");
	expect(docks).toHaveLength(1);
	expect(docks[0]).toContainElement(screen.getByRole("textbox", { name: "Message" }));
	expect(screen.queryByRole("navigation", { name: "Tabs" })).not.toBeInTheDocument();
	expect(docks[0]).not.toHaveClass("border-t");
	expect((docks[0] as HTMLElement).style.paddingBottom).toBe(
		"var(--dock-bottom-inset, var(--safe-area-bottom, env(safe-area-inset-bottom)))",
	);
	rerender(
		<AppShell
			{...props}
			detailOpen
			meOpen
			me={{ list: <ListFrame title="Settings">Settings</ListFrame>, pages: [], closeLabel: "Close", onClose() {} }}
		/>,
	);
	expect(container.querySelectorAll("[data-mobile-dock]")).toHaveLength(0);
});

test("the desktop content card has the same token inset on all four sides", () => {
	viewport(1280);
	const { container } = render(<AppShell {...props} detailOpen desktop />);
	const detail = container.querySelector("[data-page-layer=detail]");
	expect(detail).toHaveClass("p-[var(--spacing-2)]");
	expect(detail).not.toHaveClass("pb-[var(--spacing-2)]", "pe-[var(--spacing-2)]");
	expect(container.querySelectorAll("[data-mobile-dock]")).toHaveLength(0);
});

test.each([
	[1280, true, "wide", 0, false],
	[390, true, "compact", 1, true],
	[390, false, "mobile", 1, false],
] as const)(
	"settings Back controls reflect actual parent pages at %spx desktop=%s",
	(width, desktop, mode, rootBacks, hasClose) => {
		viewport(width);
		const close = vi.fn();
		const back = vi.fn();
		const list = <ListFrame title="Settings">Settings list</ListFrame>;
		const root = { key: "/me/models", content: <PageFrame title="Models">Models list</PageFrame> };
		const nested = { key: "/me/models/add", content: <PageFrame title="Add provider">Provider editor</PageFrame> };
		const shell = (pages: (typeof root)[]) => (
			<AppShell
				{...props}
				desktop={desktop}
				meOpen
				onBack={back}
				me={{ list, pages, onClose: close, closeLabel: "Close" }}
			/>
		);
		const { container, rerender } = render(shell([]));
		expect(container.querySelector("[data-layout-mode]")).toHaveAttribute("data-layout-mode", mode);
		expect(screen.queryAllByRole("button", { name: "Back" })).toHaveLength(mode === "mobile" ? 1 : 0);
		if (hasClose) {
			fireEvent.click(screen.getByRole("button", { name: "Close" }));
			expect(close).toHaveBeenCalledTimes(1);
		}
		rerender(shell([root]));
		expect(screen.queryAllByRole("button", { name: "Back" })).toHaveLength(rootBacks);
		rerender(shell([root, nested]));
		const controls = screen.getAllByRole("button", { name: "Back" });
		expect(controls).toHaveLength(1);
		fireEvent.click(screen.getByRole("button", { name: "Back" }));
		expect(back).toHaveBeenCalledTimes(1);
	},
);

test.each([1280, 820, 390])("desktop rail remains interactive and shares one Me toggle at %spx", (width) => {
	viewport(width);
	const open = vi.fn();
	const close = vi.fn();
	const { rerender } = render(<AppShell {...props} desktop onOpenMe={open} />);
	fireEvent.click(screen.getByRole("button", { name: "Me" }));
	fireEvent.click(screen.getByRole("button", { name: "Settings" }));
	expect(open).toHaveBeenCalledTimes(2);
	rerender(
		<AppShell
			{...props}
			desktop
			onOpenMe={open}
			meOpen
			me={{
				list: <ListFrame title="Settings">Settings list</ListFrame>,
				pages: [],
				closeLabel: "Close",
				onClose: close,
			}}
		/>,
	);
	for (const name of ["Me", "Settings"]) {
		const button = screen.getByRole("button", { name });
		expect(button.closest("[inert], [aria-hidden=true]")).toBeNull();
		expect(button).toHaveAttribute("aria-expanded", "true");
		fireEvent.click(button);
	}
	expect(close).toHaveBeenCalledTimes(2);
	expect(open).toHaveBeenCalledTimes(2);
});

test("phone layout omits the desktop settings shortcut", () => {
	viewport(390);
	render(<AppShell {...props} />);
	expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
});
