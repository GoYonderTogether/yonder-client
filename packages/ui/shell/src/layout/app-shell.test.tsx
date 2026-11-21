// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { AppShell } from "./app-shell.tsx";
import { ListFrame, PageFrame } from "./frames.tsx";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function DraftDetail() {
	const [value, setValue] = useState("");
	return <input aria-label="Draft" value={value} onChange={(event) => setValue(event.target.value)} />;
}

test("entering me opens the left layer and Escape returns through its root", () => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 820 } as DOMRect);
	const onBack = vi.fn();
	const shell = (meOpen: boolean) => (
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
			meOpen={meOpen}
			me={
				meOpen
					? { list: <ListFrame title="Me">settings list</ListFrame>, pages: [], closeLabel: "Close", onClose: onBack }
					: undefined
			}
			onBack={onBack}
			backLabel="Back"
			mobileShowList
			list={
				<ListFrame title="Me">
					<span>settings list</span>
				</ListFrame>
			}
			content={<PageFrame>{null}</PageFrame>}
			detailOpen={meOpen}
			composer={null}
			titlebarInset={false}
			brand={null}
			labels={{ showList: "Show list", hideList: "Hide list", resizeList: "Resize list" }}
			locationKey={meOpen ? "/me" : "/messages"}
		/>
	);

	const { rerender } = render(shell(false));
	expect(screen.queryByRole("region", { name: "Me" })).not.toBeInTheDocument();
	rerender(shell(true));
	expect(screen.getByRole("region", { name: "Me" })).toHaveAttribute("data-page-side", "left");
	fireEvent.keyDown(window, { key: "Escape" });
	expect(onBack).toHaveBeenCalledTimes(1);
});

test("the detail instance and its focus survive a mobile-to-desktop resize", () => {
	const observers = new Set<ResizeObserverCallback>();
	const resize = (width: number) =>
		observers.forEach((callback) => {
			callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
		});
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(private callback: ResizeObserverCallback) {
				observers.add(callback);
			}
			observe() {}
			disconnect() {
				observers.delete(this.callback);
			}
		},
	);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 390 } as DOMRect);
	render(
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
			onBack={vi.fn()}
			backLabel="Back"
			mobileShowList={false}
			list={<ListFrame title="Me">settings list</ListFrame>}
			content={
				<PageFrame>
					<DraftDetail />
				</PageFrame>
			}
			detailOpen
			composer={null}
			titlebarInset={false}
			brand={null}
			labels={{ showList: "Show list", hideList: "Hide list", resizeList: "Resize list" }}
			locationKey="/me/models/add"
		/>,
	);
	const input = screen.getByRole("textbox", { name: "Draft" });
	fireEvent.change(input, { target: { value: "draft" } });
	input.focus();
	for (const width of [820, 1280, 820, 390]) {
		act(() => resize(width));
		expect(screen.getByRole("textbox", { name: "Draft" })).toBe(input);
		expect(input).toHaveValue("draft");
		expect(input).toHaveFocus();
	}
});

test("drag shields the right pane, collapses past 82%, and can restore without remounting", () => {
	vi.stubGlobal("PointerEvent", MouseEvent);
	vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
	Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
	Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { configurable: true, value: vi.fn() });
	Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { configurable: true, value: () => true });
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 1280 } as DOMRect);
	const onBack = vi.fn();
	const { container } = render(
		<AppShell
			tab={{
				current: "messages",
				onSelect: vi.fn(),
				labels: { messages: "Messages", tasks: "Tasks", memory: "Memory", contacts: "Contacts" },
				ariaLabel: "Tabs",
			}}
			renderAvatar={() => null}
			personName="Name"
			meLabel="Me"
			settingsLabel="Settings"
			onOpenMe={vi.fn()}
			meOpen={false}
			onBack={onBack}
			backLabel="Back"
			list={<span>list</span>}
			content={<DraftDetail />}
			detailOpen
			composer={null}
			titlebarInset={false}
			brand={null}
			labels={{ showList: "Show list", hideList: "Hide list", resizeList: "Resize list" }}
			locationKey="/messages"
		/>,
	);
	const input = screen.getByRole("textbox", { name: "Draft" });
	const detail = input.closest("[data-page-layer=detail]");
	const splitter = screen.getByRole("separator");
	fireEvent.pointerDown(splitter, { button: 0, clientX: 320 });
	expect(container.querySelector("[data-pane-drag-shield]")).not.toBeNull();
	fireEvent.pointerMove(splitter, { clientX: 1049 });
	expect(detail).not.toHaveClass("hidden");
	expect(detail).not.toHaveAttribute("aria-hidden", "true");
	fireEvent.pointerMove(splitter, { clientX: 1050 });
	expect(detail).toHaveClass("hidden");
	expect(detail).toHaveAttribute("aria-hidden", "true");
	expect(detail).toHaveAttribute("inert");
	fireEvent.keyDown(window, { key: "Escape" });
	expect(detail).not.toHaveClass("hidden");
	expect(detail).not.toHaveAttribute("aria-hidden", "true");
	expect(onBack).not.toHaveBeenCalled();
	expect(container.querySelector("[data-pane-drag-shield]")).toBeNull();
	fireEvent.keyDown(splitter, { key: "End" });
	expect(detail).toHaveClass("hidden");
	expect(detail).toHaveAttribute("aria-hidden", "true");
	expect(detail).toHaveAttribute("inert");
	fireEvent.doubleClick(splitter);
	expect(splitter).toHaveAttribute("aria-valuenow", "640");
	expect(screen.getByRole("textbox", { name: "Draft" })).toBe(input);
});

test("a departing Me child stops consuming Escape before its animation finishes", () => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 390 } as DOMRect);
	const close = vi.fn();
	const props = {
		tab: {
			current: "messages" as const,
			onSelect: vi.fn(),
			labels: { messages: "Messages", tasks: "Tasks", memory: "Memory", contacts: "Contacts" },
			ariaLabel: "Tabs",
		},
		renderAvatar: () => null,
		personName: "Name",
		meLabel: "Me",
		settingsLabel: "Settings",
		onOpenMe: vi.fn(),
		meOpen: true,
		backLabel: "Back",
		list: <span>chats</span>,
		content: null,
		detailOpen: false,
		composer: null,
		titlebarInset: false,
		brand: null,
		labels: { showList: "Show list", hideList: "Hide list", resizeList: "Resize list" },
		locationKey: "/messages",
	};
	const onBack = vi.fn();
	const { rerender } = render(
		<AppShell
			{...props}
			onBack={onBack}
			me={{
				list: <span>settings list</span>,
				pages: [{ key: "/me/about", content: <span>about body</span> }],
				onClose: close,
				closeLabel: "Close",
			}}
		/>,
	);
	fireEvent.keyDown(window, { key: "Escape" });
	expect(onBack).toHaveBeenCalledTimes(1);
	rerender(
		<AppShell
			{...props}
			onBack={onBack}
			me={{ list: <span>settings list</span>, pages: [], closeLabel: "Close", onClose: close }}
		/>,
	);
	fireEvent.keyDown(window, { key: "Escape" });
	expect(close).toHaveBeenCalledTimes(1);
});
