// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import { TimelineDaySection } from "./timeline-cards.tsx";
import type { TimelineDay } from "./timeline-types.ts";

// An entity link in a step's words reads its profile from the same hook the memory page uses.
vi.mock("@yonder/ui-data", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@yonder/ui-data")>();
	return {
		...actual,
		useEntityProfile: () => ({
			data: {
				id: "ent_0123456789ABCDEFGHJKMNPQRS",
				type: "person",
				name: "刀哥",
				path: "/people/刀哥.md",
				avatar: { kind: "initial" },
			},
		}),
	};
});
vi.mock("../../../preview/use-attachment-blob.ts", () => ({
	useAttachmentBlob: () => ({ blob: undefined, load: async () => undefined }),
}));
vi.mock("../../../lib/use-object-url.ts", () => ({ useObjectUrl: () => undefined }));

/**
 * A timeline step's `source` (04 图标登记表 展示): a brand id from the registry plus one quoted line.
 * A step with a source draws that brand's official icon; a step without one keeps the drawing the
 * timeline always had, so an older entry reads exactly as before.
 */
function dayWith(source: { brand: "wechat" | "apple-messages"; label: string } | undefined): TimelineDay {
	return {
		date: "2026-11-28",
		events: [
			{
				part: "morning",
				headline: "Two people were waiting on you.",
				steps: [
					{
						at: "09:04",
						kind: "message",
						from: { name: "万圣尧" },
						text: "Asked whether you are joining the salon.",
						...(source ? { source } : {}),
					},
				],
			},
		],
	};
}

function show(day: TimelineDay) {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<MemoryRouter>
				<TimelineDaySection day={day} />
			</MemoryRouter>
		</I18nextProvider>,
	);
}

/** The official icon of a brand draws its own bundled file; a step with no brand draws none. */
function brandIconFile(): string | null {
	return document.querySelector(".tl-msg-icon")?.getAttribute("src") ?? null;
}

test("a source draws its brand's own icon, not a fixed one", () => {
	show(dayWith({ brand: "apple-messages", label: "From Messages" }));
	expect(screen.getByText("From Messages")).toBeVisible();
	expect(brandIconFile()).toContain("apple-messages.png");
	// The old hard-coded WeChat icon is gone: a Messages step never draws WeChat.
	expect(brandIconFile()).not.toContain("wechat.png");
});

test("a step with no source keeps the drawing it always had: no brand icon, no quoted line", () => {
	show(dayWith(undefined));
	expect(screen.getByText("万圣尧")).toBeVisible();
	expect(screen.getByText("Asked whether you are joining the salon.")).toBeVisible();
	expect(brandIconFile()).toBeNull();
	expect(document.querySelector(".tl-msg-source")).toBeNull();
});

test("a step's own words draw an entity link among plain text", () => {
	// A talk step's text is the line the organizer kept, so an `entity:` token in it must still link.
	show({
		date: "2026-11-28",
		events: [
			{
				part: "morning",
				headline: "You answered an invitation.",
				// A card, so its steps are drawn; a quiet line shows only its headline.
				major: true,
				steps: [{ at: "09:10", kind: "talk", text: "你答应了 [刀哥](entity:ent_0123456789ABCDEFGHJKMNPQRS) 的邀请。" }],
			},
		],
	});
	expect(screen.getByRole("button", { name: "Open 刀哥" })).toBeVisible();
	expect(screen.getByText(/你答应了/)).toBeVisible();
});
