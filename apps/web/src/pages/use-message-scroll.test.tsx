// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useMessageScroll } from "./use-message-scroll.ts";

let resize: (() => void) | undefined;

beforeEach(() => {
	resize = undefined;
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe = vi.fn();
			disconnect = vi.fn();
			constructor(callback: () => void) {
				resize = callback;
			}
		},
	);
});

afterEach(() => vi.unstubAllGlobals());

function Harness({ conversationId = "a", ids }: { conversationId?: string; ids: string[] }) {
	const { bottom, showLatest, jumpToLatest } = useMessageScroll(
		conversationId,
		ids.map((id) => ({ id })),
	);
	return (
		<div className="overflow-y-auto" data-testid="scroll">
			<div ref={bottom} />
			{showLatest ? (
				<button type="button" onClick={jumpToLatest}>
					Latest
				</button>
			) : null}
		</div>
	);
}

test("follows only within 40px, interrupts immediately, offers latest after 120px, and resets per conversation", () => {
	const view = render(<Harness ids={[]} />);
	const scroll = screen.getByTestId("scroll");
	let height = 1000;
	let top = 0;
	Object.defineProperties(scroll, {
		scrollHeight: { get: () => height },
		clientHeight: { value: 200 },
		scrollTop: {
			get: () => top,
			set: (value: number) => {
				top = Math.max(0, Math.min(value, height - 200));
			},
		},
	});
	view.rerender(<Harness ids={["1"]} />);
	expect(top).toBe(800);
	top = 760;
	fireEvent.scroll(scroll);
	height = 1040;
	view.rerender(<Harness ids={["1", "2"]} />);
	expect(top).toBe(840);
	top = 799;
	fireEvent.scroll(scroll);
	height = 1100;
	view.rerender(<Harness ids={["1", "2", "3"]} />);
	expect(top).toBe(799);
	expect(screen.queryByRole("button")).toBeNull();
	top = 779;
	fireEvent.scroll(scroll);
	fireEvent.click(screen.getByRole("button", { name: "Latest" }));
	expect(top).toBe(900);
	fireEvent.wheel(scroll, { deltaY: -1 });
	height = 1120;
	view.rerender(<Harness ids={["1", "2", "3", "4"]} />);
	expect(top).toBe(900);
	top = 500;
	fireEvent.scroll(scroll);
	view.rerender(<Harness conversationId="b" ids={["b1"]} />);
	expect(top).toBe(920);
	expect(screen.queryByRole("button")).toBeNull();
});

test("prepending history preserves the message under the reader's eyes", () => {
	const view = render(<Harness ids={[]} />);
	const scroll = screen.getByTestId("scroll");
	let height = 1000;
	Object.defineProperties(scroll, { scrollHeight: { get: () => height }, clientHeight: { value: 200 } });
	view.rerender(<Harness ids={["2", "3"]} />);
	scroll.scrollTop = 300;
	fireEvent.scroll(scroll);
	height = 1400;
	view.rerender(<Harness ids={["1", "2", "3"]} />);
	expect(scroll.scrollTop).toBe(700);
});

test("growing the dock keeps the latest message in view until the reader scrolls up", () => {
	const view = render(<Harness ids={[]} />);
	const scroll = screen.getByTestId("scroll");
	let height = 1000;
	let top = 0;
	Object.defineProperties(scroll, {
		scrollHeight: { get: () => height },
		clientHeight: { value: 200 },
		scrollTop: {
			get: () => top,
			set: (value: number) => {
				top = Math.max(0, Math.min(value, height - 200));
			},
		},
	});
	view.rerender(<Harness ids={["1"]} />);
	expect(top).toBe(800);
	height += 108;
	// The first jump's scroll event can arrive after the padding has already changed.
	fireEvent.scroll(scroll);
	resize?.();
	expect(top).toBe(908);
	fireEvent.wheel(scroll, { deltaY: -1 });
	scroll.scrollTop = 500;
	fireEvent.scroll(scroll);
	height += 80;
	resize?.();
	expect(top).toBe(500);
	height += 200;
	view.rerender(<Harness ids={["0", "1"]} />);
	expect(top).toBe(700);
});
