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

const me = "person-me";
const peer = "person-peer";
const mine = (id: string) => ({ id, senderId: me });
const theirs = (id: string) => ({ id, senderId: peer });

function Harness({
	conversationId = "a",
	items,
	offset,
	selfId = me,
}: {
	conversationId?: string;
	items: { id: string; senderId?: string }[];
	offset?: (id: string) => number;
	selfId?: string;
}) {
	const { bottom, showLatest, newCount, jumpToLatest } = useMessageScroll(conversationId, items, undefined, selfId);
	return (
		<div className="overflow-y-auto" data-testid="scroll">
			{offset &&
				items.map(({ id }) => (
					<div
						key={id}
						data-message-id={id}
						ref={(node) => {
							if (node)
								node.getBoundingClientRect = () => new DOMRect(0, offset(id) - (node.parentElement?.scrollTop ?? 0));
						}}
					/>
				))}
			<div ref={bottom} />
			{showLatest ? (
				<button type="button" onClick={jumpToLatest}>
					{newCount > 0 ? `${newCount} new` : "Latest"}
				</button>
			) : null}
		</div>
	);
}

function scrollBox(scroll: HTMLElement, initialHeight = 1000) {
	let height = initialHeight;
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
	return {
		get top() {
			return top;
		},
		set top(value: number) {
			top = value;
		},
		get height() {
			return height;
		},
		set height(value: number) {
			height = value;
		},
	};
}

test("follows only at the bottom, interrupts immediately, and resets per conversation", () => {
	const view = render(<Harness items={[]} />);
	const scroll = screen.getByTestId("scroll");
	const box = scrollBox(scroll);
	view.rerender(<Harness items={[theirs("1")]} />);
	expect(box.top).toBe(800);
	box.top = 798;
	fireEvent.scroll(scroll);
	box.height = 1040;
	view.rerender(<Harness items={[theirs("1"), theirs("2")]} />);
	expect(box.top).toBe(840);
	// 50px above the end is past the 48px stick band: the reader chose this position.
	box.top = 790;
	fireEvent.scroll(scroll);
	box.height = 1100;
	view.rerender(<Harness items={[theirs("1"), theirs("2"), theirs("3")]} />);
	expect(box.top).toBe(790);
	box.top = 779;
	fireEvent.scroll(scroll);
	fireEvent.click(screen.getByRole("button"));
	expect(box.top).toBe(900);
	fireEvent.wheel(scroll, { deltaY: -1 });
	box.height = 1120;
	view.rerender(<Harness items={[theirs("1"), theirs("2"), theirs("3"), theirs("4")]} />);
	expect(box.top).toBe(900);
	box.top = 500;
	fireEvent.scroll(scroll);
	view.rerender(<Harness conversationId="b" items={[theirs("b1")]} />);
	expect(box.top).toBe(920);
	expect(screen.queryByRole("button")).toBeNull();
});

test("prepending history preserves the message under the reader's eyes", () => {
	const view = render(<Harness items={[]} />);
	const scroll = screen.getByTestId("scroll");
	const box = scrollBox(scroll);
	view.rerender(<Harness items={[theirs("2"), theirs("3")]} />);
	box.top = 300;
	fireEvent.scroll(scroll);
	box.height = 1400;
	view.rerender(<Harness items={[theirs("1"), theirs("2"), theirs("3")]} />);
	expect(box.top).toBe(700);
});

test("preserves the reading position if an older page and a live reply render together", () => {
	vi.stubGlobal("CSS", { escape: (id: string) => id });
	let firstOffset = 12;
	const offset = () => firstOffset;
	const view = render(<Harness items={[]} offset={offset} />);
	const scroll = screen.getByTestId("scroll");
	const box = scrollBox(scroll);
	view.rerender(<Harness items={[theirs("2"), theirs("3")]} offset={offset} />);
	box.top = 300;
	fireEvent.scroll(scroll);
	firstOffset += 400;
	box.height += 500;
	view.rerender(<Harness items={[theirs("1"), theirs("2"), theirs("3"), theirs("4")]} offset={offset} />);
	expect(box.top).toBe(700);
});

test("growing the dock keeps the latest message in view until the reader scrolls up", () => {
	const view = render(<Harness items={[]} />);
	const scroll = screen.getByTestId("scroll");
	const box = scrollBox(scroll);
	view.rerender(<Harness items={[theirs("1")]} />);
	expect(box.top).toBe(800);
	box.height = 1108;
	// The first jump's scroll event can arrive after the padding has already changed.
	fireEvent.scroll(scroll);
	resize?.();
	expect(box.top).toBe(908);
	fireEvent.wheel(scroll, { deltaY: -1 });
	box.top = 500;
	fireEvent.scroll(scroll);
	box.height = 1188;
	resize?.();
	expect(box.top).toBe(500);
	box.height = 1388;
	view.rerender(<Harness items={[theirs("0"), theirs("1")]} />);
	expect(box.top).toBe(700);
});

test("the reader's own message always reaches the end, from anywhere in the history", () => {
	const view = render(<Harness items={[]} />);
	const scroll = screen.getByTestId("scroll");
	const box = scrollBox(scroll);
	view.rerender(<Harness items={[theirs("1"), theirs("2")]} />);
	box.top = 0;
	fireEvent.scroll(scroll);
	fireEvent.wheel(scroll, { deltaY: -300 });
	// Reading history well above the end, with the return button already up.
	view.rerender(<Harness items={[theirs("0"), theirs("1"), theirs("2")]} />);
	expect(box.top).toBe(0);
	box.height = 1200;
	view.rerender(<Harness items={[theirs("0"), theirs("1"), theirs("2"), mine("temp_self")]} />);
	expect(box.top).toBe(1000);
	expect(screen.queryByRole("button")).toBeNull();
});

test("the server replacing an optimistic message does not count as another send", () => {
	const view = render(<Harness items={[]} />);
	const scroll = screen.getByTestId("scroll");
	const box = scrollBox(scroll);
	view.rerender(<Harness items={[theirs("1")]} />);
	box.top = 200;
	fireEvent.scroll(scroll);
	box.height = 1200;
	view.rerender(<Harness items={[theirs("1"), mine("temp_nonce")]} />);
	expect(box.top).toBe(1000);
	box.top = 200;
	fireEvent.scroll(scroll);
	box.height = 1300;
	view.rerender(<Harness items={[theirs("1"), mine("sent-9")]} />);
	expect(box.top).toBe(200);
});

test("someone else's message while away keeps the position and counts the new ones", () => {
	const view = render(<Harness items={[]} />);
	const scroll = screen.getByTestId("scroll");
	const box = scrollBox(scroll);
	view.rerender(<Harness items={[theirs("1"), theirs("2")]} />);
	box.top = 500;
	fireEvent.scroll(scroll);
	fireEvent.wheel(scroll, { deltaY: -300 });
	box.height = 1040;
	view.rerender(<Harness items={[theirs("1"), theirs("2"), theirs("3")]} />);
	expect(box.top).toBe(500);
	expect(screen.getByRole("button", { name: "1 new" })).toBeTruthy();
	box.height = 1080;
	view.rerender(<Harness items={[theirs("1"), theirs("2"), theirs("3"), theirs("4")]} />);
	expect(screen.getByRole("button", { name: "2 new" })).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "2 new" }));
	expect(box.top).toBe(880);
	expect(screen.queryByRole("button")).toBeNull();
});

test("coming back to the end by hand clears the count", () => {
	const view = render(<Harness items={[]} />);
	const scroll = screen.getByTestId("scroll");
	const box = scrollBox(scroll);
	view.rerender(<Harness items={[theirs("1"), theirs("2")]} />);
	box.top = 500;
	fireEvent.scroll(scroll);
	box.height = 1040;
	view.rerender(<Harness items={[theirs("1"), theirs("2"), theirs("3")]} />);
	box.top = 840;
	fireEvent.scroll(scroll);
	expect(screen.queryByRole("button")).toBeNull();
});

test("a stream that keeps growing is followed while at the end but not after scrolling up", () => {
	const view = render(<Harness items={[]} />);
	const scroll = screen.getByTestId("scroll");
	const box = scrollBox(scroll);
	view.rerender(<Harness items={[theirs("1"), theirs("2")]} />);
	expect(box.top).toBe(800);
	box.height = 1300;
	view.rerender(<Harness items={[theirs("1"), theirs("2"), theirs("3")]} />);
	expect(box.top).toBe(1100);
	box.height = 1500;
	view.rerender(<Harness items={[theirs("1"), theirs("2"), theirs("3"), theirs("4")]} />);
	expect(box.top).toBe(1300);
	// The reader scrolls up while the reply is still arriving.
	fireEvent.wheel(scroll, { deltaY: -200 });
	box.top = 600;
	fireEvent.scroll(scroll);
	box.height = 1700;
	view.rerender(<Harness items={[theirs("1"), theirs("2"), theirs("3"), theirs("4"), theirs("5")]} />);
	expect(box.top).toBe(600);
	// Back at the end by hand, the rest of the stream is followed again.
	box.top = 1500;
	fireEvent.scroll(scroll);
	box.height = 1800;
	view.rerender(<Harness items={[theirs("1"), theirs("2"), theirs("3"), theirs("4"), theirs("5"), theirs("6")]} />);
	expect(box.top).toBe(1600);
});

test("a late image that grows the list inside the 48px band keeps following", () => {
	const view = render(<Harness items={[]} />);
	const scroll = screen.getByTestId("scroll");
	const box = scrollBox(scroll);
	view.rerender(<Harness items={[theirs("1"), theirs("2")]} />);
	// An image finished loading and pushed the end down 30px without any scroll event.
	box.top = 770;
	fireEvent.scroll(scroll);
	box.height = 1070;
	view.rerender(<Harness items={[theirs("1"), theirs("2"), theirs("3")]} />);
	expect(box.top).toBe(870);
});
