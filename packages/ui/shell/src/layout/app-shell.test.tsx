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

test("entering me on a medium window opens its list; Escape closes it before going back", () => {
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
				labels: { messages: "Messages", tasks: "Tasks", memory: "Memory" },
				ariaLabel: "Tabs",
			}}
			renderAvatar={() => <span>avatar</span>}
			personName="Name"
			meLabel="Me"
			onOpenMe={vi.fn()}
			meOpen={meOpen}
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
	expect(screen.queryByRole("complementary", { name: "Show list" })).not.toBeInTheDocument();
	rerender(shell(true));
	expect(screen.getByRole("complementary", { name: "Show list" })).toHaveTextContent("settings list");
	fireEvent.keyDown(window, { key: "Escape" });
	expect(screen.queryByRole("complementary", { name: "Show list" })).not.toBeInTheDocument();
	expect(onBack).not.toHaveBeenCalled();
	fireEvent.keyDown(window, { key: "Escape" });
	expect(onBack).toHaveBeenCalledTimes(1);
});

test("the detail instance and its focus survive a mobile-to-desktop resize", () => {
	let resize = (_width: number) => {};
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback: ResizeObserverCallback) {
				resize = (width) =>
					callback([{ contentRect: { width } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
			}
			observe() {}
			disconnect() {}
		},
	);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 390 } as DOMRect);
	render(
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
			onOpenMe={vi.fn()}
			meOpen
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
