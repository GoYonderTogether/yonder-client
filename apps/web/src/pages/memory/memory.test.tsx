// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Member, MemoryDay, MemoryMonth, MemoryRefDetail } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryCards } from "./memory-cards.tsx";
import { MemoryTimeline } from "./memory-timeline.tsx";

// Exercise card state here; shell tests and browser checks cover the animated overlay lifecycle.
vi.mock("@yonder/ui-shell", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@yonder/ui-shell")>();
	return {
		...actual,
		Overlay: ({ open, title, closeLabel, onClose, children }: import("@yonder/ui-shell").OverlayProps) =>
			open ? (
				<dialog open aria-label={title}>
					<button type="button" onClick={onClose}>
						{closeLabel}
					</button>
					{children}
				</dialog>
			) : null,
	};
});

const person: Member = {
	id: "memory-check",
	kind: "person",
	handle: "memorycheck",
	displayName: "Card check",
	avatarUrl: null,
	bio: "Existing account bio",
	createdAt: "2026-01-01T00:00:00Z",
	version: 1,
};

function show(children: React.ReactNode) {
	return render(<I18nextProvider i18n={createI18n("en")}>{children}</I18nextProvider>);
}

test("the public card uses the account, switches to private AI empty state and expands both cards", () => {
	show(<MemoryCards person={person} />);
	expect(screen.getByText("Card check")).toBeVisible();
	expect(screen.getByRole("img", { name: "Scan to add me" })).toBeVisible();
	expect(screen.queryByText(person.bio as string)).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Show How AI sees me" }));
	expect(screen.getByText("Your understanding, still unfolding")).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Expand both cards" }));
	expect(screen.getByText("Card check")).toBeVisible();
	expect(screen.getByText("Your understanding, still unfolding")).toBeVisible();
	expect(screen.getByRole("button", { name: "Stack cards" })).toHaveAttribute("aria-expanded", "true");
});

test("editing a card is a local preview with cancel and optional avatar and bio", async () => {
	const { container } = show(<MemoryCards person={person} />);
	fireEvent.click(screen.getByRole("button", { name: "Edit card" }));
	expect(screen.getByText("Preview for this visit")).toBeVisible();
	fireEvent.click(screen.getByRole("checkbox", { name: "Show avatar" }));
	fireEvent.click(screen.getByRole("checkbox", { name: "Show profile bio" }));
	fireEvent.click(screen.getByRole("button", { name: "Reading" }));
	fireEvent.click(screen.getByRole("button", { name: "Done" }));
	await waitFor(() => expect(screen.queryByText("Preview for this visit")).not.toBeInTheDocument());
	expect(container.querySelector("[data-avatar-fallback]")).toBeNull();
	expect(screen.getByText(person.bio as string)).toBeVisible();
	expect(screen.getByText("Reading")).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Edit card" }));
	fireEvent.click(screen.getByRole("checkbox", { name: "Show avatar" }));
	fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
	await waitFor(() => expect(screen.queryByText("Preview for this visit")).not.toBeInTheDocument());
	expect(container.querySelector("[data-avatar-fallback]")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Edit card" }));
	expect(screen.getByRole("checkbox", { name: "Show avatar" })).not.toBeChecked();
	expect(screen.getByRole("checkbox", { name: "Show profile bio" })).toBeChecked();
	expect(screen.getByRole("button", { name: "Reading" })).toHaveAttribute("aria-pressed", "true");
});

const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();
const ref = (id: string, type: MemoryDay["refs"][number]["type"], label: string, quote: string | null = null) => ({
	id,
	type,
	label,
	detail: null,
	quote,
	notes: type === "device" ? ["Reconnected 3 times on an unstable network, kept as one work block"] : [],
});
const today: MemoryDay = {
	date: "2026-11-16",
	lede: "Recorded an idea after lunch",
	refs: [
		ref("place:office", "place", "Office"),
		ref("file:timeline", "file", "memory-timeline.tsx"),
		ref("rec:idea", "recording", "Recording 12 min", "Keep only what matters."),
		ref("dev:16", "device", "Device records"),
	],
	rows: [
		{ id: "r1", type: "place", startsAt: at(16, 9, 18), endsAt: null, ref: "place:office", note: null },
		{
			id: "r2",
			type: "event",
			at: at(16, 10, 24),
			kind: "work",
			title: "Edited the timeline",
			detail: null,
			weight: "normal",
			refs: ["file:timeline"],
		},
		{
			id: "r3",
			type: "event",
			at: at(16, 13, 30),
			kind: "voice",
			title: "Recorded an idea",
			detail: null,
			weight: "key",
			refs: ["rec:idea"],
		},
		{
			id: "r4",
			type: "event",
			at: at(16, 17, 0),
			kind: "meeting",
			title: "Planned review",
			detail: null,
			weight: "normal",
			refs: [],
		},
	],
	merged: { count: 640, ref: "dev:16" },
};
const yesterday: MemoryDay = {
	...today,
	date: "2026-11-15",
	lede: "Walked by the river",
	rows: [],
	merged: { count: 0, ref: null },
};
const older: MemoryDay = {
	...today,
	date: "2026-11-05",
	lede: "Met an investor",
	rows: [
		{ id: "o1", type: "place", startsAt: at(5, 9), endsAt: at(5, 18), ref: "place:office", note: null },
		{ ...(today.rows[1] as Extract<MemoryDay["rows"][number], { type: "event" }>), id: "o2", at: at(5, 10) },
		{ ...(today.rows[2] as Extract<MemoryDay["rows"][number], { type: "event" }>), id: "o3", at: at(5, 15) },
	],
};
const june: MemoryMonth = {
	month: "2026-06",
	note: null,
	refs: [ref("file:connector", "file", "connector.rs"), ref("place:park", "place", "Park")],
	highlights: [{ date: "2026-06-21", lede: "Went to the park" }],
	dayCount: 30,
};
const refDetail: MemoryRefDetail = {
	ref: ref("file:timeline", "file", "memory-timeline.tsx"),
	uses: [
		{ date: "2026-11-16", rowId: "r2", at: at(16, 10, 24), text: "Edited the timeline" },
		{ date: "2026-11-05", rowId: "o2", at: at(5, 10), text: "Edited the timeline" },
	],
};
const data = vi.hoisted(() => ({
	days: vi.fn(),
	refetch: vi.fn(),
	recent: null as unknown,
}));
vi.mock("@yonder/ui-data", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@yonder/ui-data")>();
	const done = (value: unknown) => ({ data: value, isError: false, isSuccess: true, isPending: false, error: null });
	return {
		...actual,
		useMemoryDays: (month: string | null = null) => {
			data.days(month);
			return month ? done({ items: [] }) : data.recent;
		},
		useMemoryMonths: () => done({ items: [{ ...june, month: "2026-11" }, june] }),
		useMemoryRef: (id: string | null) => (id ? done(refDetail) : done(undefined)),
	};
});
const ok = (items: MemoryDay[]) => ({
	data: { items },
	isError: false,
	isSuccess: true,
	isPending: false,
	error: null,
	refetch: data.refetch,
});
beforeEach(() => {
	vi.useFakeTimers({ now: new Date(2026, 10, 16, 15, 40), toFake: ["Date"] });
	Element.prototype.scrollIntoView = vi.fn();
	data.recent = ok([today, yesterday, older]);
	data.days.mockClear();
});
afterEach(() => vi.useRealTimers());

test("the page holds only day headers and entries; today shows the time now and dims what is ahead", () => {
	show(<MemoryTimeline />);
	const day = screen.getByRole("region", { name: /Today/ });
	expect(within(day).getByText("Now 15:40")).toBeVisible();
	const place = within(day).getByRole("button", { name: /Office/ });
	expect(place).toHaveTextContent("still here");
	expect(within(day).getByRole("button", { name: /Recorded an idea/ })).toHaveTextContent("Keep only what matters.");
	expect(
		within(day)
			.getByRole("button", { name: /Planned review/ })
			.closest("li"),
	).toHaveClass("memory-entry-upcoming");
	expect(within(day).queryByText(/raw records/)).not.toBeInTheDocument();
	expect(screen.getByRole("heading", { name: /Yesterday/ })).toBeVisible();
});

test("days older than a week fold to their summary until opened", () => {
	show(<MemoryTimeline />);
	const day = screen.getByRole("region", { name: /November 5/ });
	expect(within(day).queryByText("Edited the timeline")).not.toBeInTheDocument();
	fireEvent.click(within(day).getByRole("button", { name: /Met an investor/ }));
	expect(within(day).getByText("Edited the timeline")).toBeVisible();
});

test("an entry opens its sources, a source lists every moment, and picking one jumps there", async () => {
	show(<MemoryTimeline />);
	fireEvent.click(screen.getByRole("button", { name: /Edited the timeline/ }));
	const sheet = await screen.findByRole("dialog");
	expect(within(sheet).getByText("Where this came from")).toBeVisible();
	expect(within(sheet).getByText("Sorted from 640 raw records that day")).toBeVisible();
	fireEvent.click(within(sheet).getByRole("button", { name: /memory-timeline.tsx/ }));
	expect(await within(sheet).findByText("Appears at 2 moments")).toBeVisible();
	fireEvent.click(within(sheet).getByRole("button", { name: /November 5/ }));
	await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("older months list their notable days and load every day when opened", () => {
	show(<MemoryTimeline />);
	const month = screen.getByRole("heading", { name: "June" }).closest("section") as HTMLElement;
	expect(within(month).getByRole("button", { name: /Went to the park/ })).toBeVisible();
	fireEvent.click(within(month).getByRole("button", { name: "Show all 30 days" }));
	expect(data.days).toHaveBeenCalledWith("2026-06");
});

test("the scroll index stays hidden until the timeline scrolls and is a labelled slider", () => {
	show(<MemoryTimeline />);
	const rail = screen.getByRole("slider", { name: "Jump to a month" });
	expect(rail).not.toHaveClass("memory-rail-visible");
	expect(rail).toHaveAttribute("aria-valuetext", "November");
});

test("a failed load shows the server's reason and a retry; no days shows an invitation", () => {
	data.recent = {
		data: undefined,
		isError: true,
		isSuccess: false,
		isPending: false,
		error: new Error("Gateway timed out"),
		refetch: data.refetch,
	};
	const { unmount } = show(<MemoryTimeline />);
	expect(screen.getByRole("alert")).toHaveTextContent("Gateway timed out");
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(data.refetch).toHaveBeenCalled();
	unmount();
	data.recent = ok([]);
	show(<MemoryTimeline />);
	expect(screen.getByRole("heading", { name: "June" })).toBeVisible();
});
