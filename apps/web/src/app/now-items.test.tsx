// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NowProvider, useNowItems, usePublishNow } from "./now-items.tsx";
import { type NowItem, NowStrip } from "./now-strip.tsx";

function Slot() {
	return <NowStrip items={useNowItems()} />;
}

function Page({ source, items }: { source: string; items: readonly NowItem[] }) {
	usePublishNow(source, items);
	return null;
}

const press = vi.fn();
const waiting: NowItem[] = [{ id: "w1", kind: "waiting", title: "回复沙龙邀请", onPress: press }];
const running: NowItem[] = [{ id: "r1", kind: "running", title: "整理相册" }];
const many: NowItem[] = ["a", "b", "c", "d"].map((id) => ({
	id,
	kind: "waiting",
	title: `事项${id}`,
	onPress: press,
}));

describe("the present above the composer", () => {
	it("lists running tasks before waiting items, whichever page published first", () => {
		render(
			<NowProvider>
				<Page source="timeline" items={waiting} />
				<Page source="tasks" items={running} />
				<Slot />
			</NowProvider>,
		);
		expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["整理相册", "回复沙龙邀请"]);
	});

	it("makes only a waiting item a button, and pressing it calls back", () => {
		render(
			<NowProvider>
				<Page source="a" items={[...waiting, ...running]} />
				<Slot />
			</NowProvider>,
		);
		expect(screen.getAllByRole("button")).toHaveLength(1);
		fireEvent.click(screen.getByRole("button", { name: "回复沙龙邀请" }));
		expect(press).toHaveBeenCalledTimes(1);
	});

	it("shows three cards at most", () => {
		render(
			<NowProvider>
				<Page source="a" items={many} />
				<Slot />
			</NowProvider>,
		);
		expect(screen.getAllByRole("listitem")).toHaveLength(3);
	});

	it("drops a page's items when that page leaves, and shows nothing when empty", () => {
		const { rerender } = render(
			<NowProvider>
				<Page source="a" items={waiting} />
				<Slot />
			</NowProvider>,
		);
		expect(screen.getAllByRole("listitem")).toHaveLength(1);
		rerender(
			<NowProvider>
				<Slot />
			</NowProvider>,
		);
		expect(screen.queryByRole("list")).toBeNull();
	});
});
