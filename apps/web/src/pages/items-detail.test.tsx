// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { Conversation, ItemDetail } from "@yonder/protocol";
import type { useItemSession } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { ItemDetailPage } from "./items-detail.tsx";

const state = vi.hoisted(() => ({ item: undefined as ItemDetail | undefined }));
vi.mock("@yonder/ui-data", () => ({
	// The account zone is the device's in these unit tests; nothing they check depends on it.
	useAccountTimeZone: () => "Asia/Shanghai",
	useItem: () => ({ data: state.item }),
	useItemActions: () => ({ cancel: { isPending: false, isError: false } }),
}));
vi.mock("./item-session-title.tsx", () => ({
	ItemSessionTitle: ({ title }: { title: string }) => <span>{title}</span>,
}));
vi.mock("./messages-page.tsx", () => ({
	ConversationPage: ({ item }: { item: { intro: React.ReactNode } }) => <>{item.intro}</>,
}));

const initial: ItemDetail = {
	id: "cnv_task",
	source: "conversation",
	title: "Apple Calendar",
	state: "failed",
	botMemberId: "bot_fixture",
	conversationId: "cnv_task",
	startedAt: "2026-11-24T00:00:00Z",
	endedAt: "2026-11-24T00:01:00Z",
	failureReason: "provider-private-diagnostic",
	result: null,
	instruction: "internal seed",
	steps: [],
	cancellable: false,
	pausable: false,
};
const session = { data: { conversation: { id: initial.conversationId } as Conversation } } as ReturnType<
	typeof useItemSession
>;
const page = () => (
	<I18nextProvider i18n={createI18n("en")}>
		<ItemDetailPage
			itemId={initial.id}
			session={session}
			disconnected={false}
			readActive
			onOpenConversation={vi.fn()}
		/>
	</I18nextProvider>
);

test("an empty failed conversation task shows only a sanitized reason, not the internal task seed", () => {
	state.item = initial;
	const view = render(page());
	expect(screen.getByRole("note").textContent).toBe("No reply this time");
	expect(screen.queryByText("provider-private-diagnostic")).toBeNull();
	expect(screen.queryByText("internal seed")).toBeNull();

	state.item = { ...initial, state: "running", failureReason: null };
	view.rerender(page());
	expect(screen.queryByRole("note")).toBeNull();
});
