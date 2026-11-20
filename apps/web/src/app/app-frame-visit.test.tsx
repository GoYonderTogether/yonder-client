// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { Conversation } from "@yonder/protocol";
import type { AppShellProps } from "@yonder/ui-shell";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ items: [] as Conversation[] }));
vi.mock("../lib/local-files.ts", () => ({ useLocalFilesAdapter: () => null }));
vi.mock("../lib/contact-window.ts", () => ({ listenForContactAdded: async () => () => {} }));
vi.mock("../lib/platform.ts", async (original) => ({
	...(await original<object>()),
	isDesktopExperience: () => false,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@yonder/feature-auth", () => ({ PasswordSetupForm: () => null }));
vi.mock("@yonder/feature-me", () => ({ isMeSection: () => false, MeList: () => null, MeSectionPage: () => null }));
vi.mock("@yonder/feature-meetings", () => ({ MeetingRecorderCapsule: () => null }));
vi.mock("../updates/controls.tsx", () => ({ UpdateControls: () => null }));
vi.mock("../pages/messages-page.tsx", () => ({
	MessagesList: () => <div>Chat list</div>,
	ConversationPage: () => <div>Conversation</div>,
}));
vi.mock("./composer.tsx", () => ({ Composer: () => <div data-testid="composer" /> }));
vi.mock("@yonder/ui-data", () => {
	const realtime = { subscribe: () => () => {}, subscribeEvents: () => () => {}, status: "connected" };
	const storage = { get: () => null, set: () => {}, remove: () => {} };
	return {
		useApi: () => ({}),
		readChatCache: async () => undefined,
		writeChatCache: async () => {},
		useData: () => ({ realtime, storage }),
		useDataQueryClient: () => ({ invalidateQueries: () => {} }),
		keys: { contacts: () => ["contacts"], conversations: { list: () => ["conversations", "list"] } },
		usePerson: () => ({ id: "host", displayName: "Host" }),
		useBot: () => ({ id: "ownbot", displayName: "My BOT" }),
		useConversations: () => ({ data: { items: state.items } }),
		useMessages: () => ({ data: { pages: [] } }),
		useMe: () => ({ data: { hasPassword: true } }),
		useHealth: () => ({ data: null }),
		useSkills: () => ({ data: { items: [] } }),
		useContacts: () => ({ data: { items: [] } }),
		useCreateItem: () => ({}),
		useItemSession: () => ({}),
		useRunActions: () => ({ stop: { mutate: () => {} } }),
		useSendMessage: () => ({ mutate: () => {} }),
		useCompactConversation: () => ({ isPending: false, isError: false, run() {}, reset() {} }),
	};
});
vi.mock("./use-meeting-upload.ts", () => ({ useMeetingUpload: () => {} }));
vi.mock("./use-meeting-recorder.ts", () => ({
	useMeetingRecorder: () => ({ state: { recordings: [], activeId: null } }),
}));
vi.mock("@yonder/ui-shell", async (original) => ({
	...(await original<object>()),
	AppShell: (props: AppShellProps) => <div data-testid="shell">{props.composer}</div>,
}));

import { AppFrame } from "./app-frame.tsx";

const visitConversation = (role: "host" | "visitor"): Conversation => ({
	id: "visit-conversation",
	kind: "direct",
	title: null,
	members: [
		{ memberId: "host", kind: "person", handle: "owner", displayName: "Host", avatarUrl: null },
		{ memberId: "visitor", kind: "person", handle: "stranger", displayName: "Stranger", avatarUrl: null },
		{ memberId: "otherbot", kind: "bot", handle: "otherbot", displayName: "Other BOT", avatarUrl: null },
	],
	visit: {
		id: "visit",
		role,
		state: role === "host" ? "pending" : "trial",
		trialSent: 3,
		trialLimit: 3,
		botId: "otherbot",
	},
	lastMessageAt: null,
	unreadCount: 0,
	pinned: false,
	version: 1,
});

function renderAt(path: string) {
	const router = createMemoryRouter([{ path: "*", element: <AppFrame /> }], { initialEntries: [path] });
	render(<RouterProvider router={router} />);
	return router;
}

test("the owner of the Bot being talked to watches the visit with no composer", () => {
	state.items = [visitConversation("host")];
	const router = renderAt("/messages/visit-conversation");
	expect(screen.getByTestId("shell")).toBeEmptyDOMElement();
	router.dispose();
});

test("a visitor in the same chat keeps the composer, because the server decides on the send", () => {
	state.items = [visitConversation("visitor")];
	const router = renderAt("/messages/visit-conversation");
	expect(screen.getByTestId("composer")).toBeInTheDocument();
	router.dispose();
});
