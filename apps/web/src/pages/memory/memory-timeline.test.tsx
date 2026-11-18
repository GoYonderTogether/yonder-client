// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { MemoryDay } from "@yonder/protocol";
import { ApiError } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryTimeline } from "./memory-timeline.tsx";
import { older, today, yesterday } from "./memory-timeline-fixture.ts";

// Photo bytes come from the authorized attachment cache; this test only checks layout and behaviour.
vi.mock("../../preview/use-attachment-blob.ts", () => ({
	useAttachmentBlob: () => ({
		blob: undefined,
		load: async () => undefined,
		loadCached: async () => undefined,
		loading: false,
		error: false,
		cacheError: false,
	}),
}));
const data = vi.hoisted(() => ({
	query: null as unknown,
	next: vi.fn(),
	refetch: vi.fn(),
	remove: vi.fn(),
	state: { isPending: false, error: null as Error | null, variables: undefined as string | undefined },
}));
vi.mock("@yonder/ui-data", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@yonder/ui-data")>();
	const mutation = (run: (value: string) => void) => () => ({
		mutate: (value: string) => {
			data.state.variables = value;
			run(value);
		},
		isPending: data.state.isPending,
		error: data.state.error,
		variables: data.state.variables,
	});
	return {
		...actual,
		useMemoryDays: () => data.query,
		useMemoryActions: () => ({ remove: mutation(data.remove)() }),
		useConversations: () => ({ data: { items: [{ id: "c-primary", isPrimary: true }] } }),
		useBot: () => ({ id: "bot-1" }),
	};
});
const pages = (items: MemoryDay[], extra: object = {}) => ({
	data: { pages: [{ items, nextCursor: null }] },
	isError: false,
	isSuccess: true,
	isPending: false,
	error: null,
	hasNextPage: false,
	isFetchingNextPage: false,
	isFetchNextPageError: false,
	fetchNextPage: data.next,
	refetch: data.refetch,
	...extra,
});
let path = "";
function Where() {
	const location = useLocation();
	path = location.pathname;
	return null;
}
function show() {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<MemoryRouter initialEntries={["/memory"]}>
				<div data-shell-frame>
					<div data-frame-scroll>
						<MemoryTimeline />
						<Where />
					</div>
				</div>
			</MemoryRouter>
		</I18nextProvider>,
	);
}
beforeEach(() => {
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
	vi.useFakeTimers({ now: new Date(2026, 10, 16, 15, 40) });
	Element.prototype.scrollIntoView = vi.fn();
	data.query = pages([today, yesterday, older]);
	data.remove.mockReset();
	data.state = { isPending: false, error: null, variables: undefined };
	path = "";
});
afterEach(() => vi.useRealTimers());

test("days read newest first with a large title, a digest and entries at their own size", () => {
	show();
	const titles = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
	expect(titles[0]).toContain("Today");
	expect(titles[1]).toContain("Yesterday");
	expect(screen.getByText("6,180 steps")).toBeVisible();
	const todaySection = screen.getByRole("region", { name: /Today/ });
	expect(within(todaySection).getByText("Office")).toBeVisible();
	expect(within(todaySection).getByText("Wensan Road, since 09:02, still here")).toBeVisible();
	expect(within(todaySection).getByText("Now 15:40")).toBeVisible();
	// What is still ahead tonight sits after "now" and reads as planned.
	expect(document.getElementById("memory-entry-reading")).toHaveClass("memory-upcoming");
	expect(document.getElementById("memory-entry-plan")).toHaveClass("memory-size-note", "memory-kind-doc");
	expect(screen.getByText("#Yonder")).toBeVisible();
	expect(within(document.getElementById("memory-entry-plan") as HTMLElement).getByText("Private")).toBeVisible();
	expect(document.getElementById("memory-entry-market")).toHaveClass("memory-size-moment");
	expect(screen.getByText("Liangzhu Arts Centre")).toBeVisible();
	expect(screen.getByText("People: 1")).toBeVisible();
});

test("an entry opens in place like an accordion, one at a time", () => {
	show();
	const plan = within(document.getElementById("memory-entry-plan") as HTMLElement).getByRole("button", {
		name: /Rewrote the timeline plan/,
	});
	const market = within(document.getElementById("memory-entry-market") as HTMLElement).getByRole("button", {
		name: /indie makers/,
	});
	expect(plan).toHaveAttribute("aria-expanded", "false");
	fireEvent.click(plan);
	expect(plan).toHaveAttribute("aria-expanded", "true");
	expect(
		within(document.getElementById("memory-drawer-plan") as HTMLElement).getByText("timeline-v4.md"),
	).toBeVisible();
	fireEvent.click(market);
	expect(market).toHaveAttribute("aria-expanded", "true");
	expect(plan).toHaveAttribute("aria-expanded", "false");
	expect(screen.getByText("Demoed Yonder nine times.")).toBeVisible();
	expect(screen.getByRole("button", { name: "p1.jpg" })).toBeVisible();
	// A one-line entry with nothing behind it is plain text, not a button.
	expect(within(document.getElementById("memory-entry-wake") as HTMLElement).queryByRole("button")).toBeNull();
});

test("an opened entry shows the organized body and where it came from", () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: /Rewrote the timeline plan/ }));
	expect(
		screen.getByText("Four sizes by how much a thing matters, from a single line to a photo mosaic."),
	).toBeVisible();
	const drawer = document.getElementById("memory-drawer-plan") as HTMLElement;
	expect(within(drawer).getByText("Yonder Bot")).toBeVisible();
	expect(within(drawer).getByText("Messages: 12")).toBeVisible();
	expect(within(drawer).getByText("Weekly review")).toBeVisible();
	// An empty title falls back to the kind's own label.
	expect(within(drawer).getByText("Task")).toBeVisible();
	// Only a source with a target is a button.
	expect(within(drawer).getByRole("button", { name: /Yonder Bot/ })).toBeEnabled();
	expect(within(drawer).queryByRole("button", { name: /Weekly review/ })).toBeNull();
});

test("a chat source opens its conversation, the primary one by its main address", () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: /Rewrote the timeline plan/ }));
	const drawer = document.getElementById("memory-drawer-plan") as HTMLElement;
	fireEvent.click(within(drawer).getByRole("button", { name: /Yonder Bot/ }));
	expect(path).toBe("/messages/main");
});

test("a task source opens the scheduled-task list", () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: /Rewrote the timeline plan/ }));
	fireEvent.click(screen.getByRole("button", { name: "Task" }));
	expect(path).toBe("/tasks/scheduled");
});

test("delete needs a second tap within four seconds and calls the mutation", () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: /Rewrote the timeline plan/ }));
	const button = screen.getByRole("button", { name: "Delete" });
	fireEvent.click(button);
	expect(data.remove).not.toHaveBeenCalled();
	const confirm = screen.getByRole("button", { name: "Confirm delete" });
	expect(confirm).toHaveClass("memory-delete-armed");
	fireEvent.click(confirm);
	expect(data.remove).toHaveBeenCalledWith("plan");
});

test("the confirmation lapses after four seconds", () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: /Rewrote the timeline plan/ }));
	fireEvent.click(screen.getByRole("button", { name: "Delete" }));
	expect(screen.getByRole("button", { name: "Confirm delete" })).toBeVisible();
	act(() => vi.advanceTimersByTime(4000));
	expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Delete" }));
	expect(data.remove).not.toHaveBeenCalled();
});

test("a failed delete shows the server's reason inline", () => {
	data.state = {
		isPending: false,
		error: new ApiError({ code: "not_found", status: 404, message: "missing" }),
		variables: "plan",
	};
	show();
	fireEvent.click(screen.getByRole("button", { name: /Rewrote the timeline plan/ }));
	expect(within(document.getElementById("memory-drawer-plan") as HTMLElement).getByRole("alert")).toHaveTextContent(
		"missing",
	);
});

test("a link inside an opened entry jumps to the entry it continues and opens it", () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: /Rewrote the timeline plan/ }));
	fireEvent.click(screen.getByRole("button", { name: "Picked up from Wednesday" }));
	const target = document.getElementById("memory-entry-followups") as HTMLElement;
	expect(target.scrollIntoView).toHaveBeenCalled();
	expect(target).toHaveClass("memory-flash", "memory-open");
});

test("older days fold their one-line entries away until asked", () => {
	show();
	const toggle = screen.getByRole("button", { name: "Small things: 1" });
	expect(toggle).toHaveAttribute("aria-expanded", "false");
	fireEvent.click(toggle);
	expect(toggle).toHaveAttribute("aria-expanded", "true");
	expect(screen.getByText("Fixed the demo on the train")).toBeInTheDocument();
});

test("a failed load shows the server's reason and a retry; no days shows an empty state", () => {
	data.query = {
		...pages([]),
		isError: true,
		isSuccess: false,
		data: undefined,
		error: new ApiError({ code: "not_found", status: 404, message: "missing" }),
	};
	const { unmount } = show();
	const alert = screen.getByRole("alert");
	expect(alert).toHaveTextContent("The timeline did not load");
	expect(alert).toHaveTextContent("missing");
	fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
	expect(data.refetch).toHaveBeenCalled();
	unmount();
	data.query = pages([]);
	show();
	expect(screen.getByText("No timeline entries")).toBeVisible();
});
