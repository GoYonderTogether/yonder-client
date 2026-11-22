// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AppShellProps } from "@yonder/ui-shell";
import { useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { AppFrame } from "./app-frame.tsx";

const { listenForContactAdded, invalidateQueries, queryClient, capturedShell } = vi.hoisted(() => {
	const invalidateQueries = vi.fn();
	return {
		listenForContactAdded: vi.fn<(callback: (id: string) => void) => Promise<() => void>>().mockResolvedValue(() => {}),
		invalidateQueries,
		queryClient: { invalidateQueries },
		capturedShell: { back: undefined as AppShellProps["onBack"] | undefined },
	};
});
vi.mock("../lib/local-files.ts", () => ({ useLocalFilesAdapter: () => null, useLocalFilesContext: () => null }));
vi.mock("../lib/contact-window.ts", () => ({ listenForContactAdded }));
vi.mock("../lib/platform.ts", async (original) => ({
	...(await original<object>()),
	isDesktopExperience: () => false,
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@yonder/feature-auth", () => ({ PasswordSetupForm: () => null }));
vi.mock("../updates/controls.tsx", () => ({ UpdateControls: () => null }));
vi.mock("@yonder/ui-data", () => {
	const realtime = { subscribe: () => () => {}, subscribeEvents: () => () => {}, status: "connected" };
	const storage = { get: () => null, set: () => {}, remove: () => {} };
	return {
		useApi: () => ({}),
		readChatCache: async () => undefined,
		writeChatCache: async () => {},
		useData: () => ({ realtime, storage }),
		useDataQueryClient: () => queryClient,
		keys: { contacts: () => ["contacts"], conversations: { list: () => ["conversations", "list"] } },
		usePerson: () => ({ id: "person", displayName: "Person" }),
		useBot: () => ({ id: "bot", displayName: "Bot" }),
		useConversations: () => ({
			data: { items: [{ id: "conversation", isPrimary: true, title: "Chat", members: [] }] },
		}),
		useMessages: () => ({ data: { pages: [] } }),
		useHealth: () => ({ data: null }),
		useMe: () => ({ data: { hasPassword: true } }),
		useSkills: () => ({ data: { items: [] } }),
		useMeetings: () => ({ data: { items: [] }, isLoading: false, isError: false, refetch: async () => {} }),
		useMeeting: () => ({ data: undefined, isLoading: false, isError: false, refetch: async () => {} }),
		useMeetingActions: () => ({
			retry: { isPending: false, isError: false, mutateAsync: async () => {} },
		}),
		useCompactConversation: () => ({
			isPending: false,
			isError: false,
			data: undefined,
			error: null,
			run() {},
			reset() {},
		}),
		useContacts: () => ({ data: { items: [] } }),
		useCreateItem: () => ({}),
		useItemSession: () => ({}),
		useSendMessage: () => ({ mutate: () => {} }),
	};
});
vi.mock("@yonder/ui-shell", async (original) => ({
	...(await original<object>()),
	AppShell: (props: AppShellProps) => {
		capturedShell.back = props.onBack;
		return (
			<>
				<button type="button" onClick={props.onOpenMe}>
					Open me
				</button>
				<button type="button" onClick={props.onBack}>
					Back
				</button>
				{props.list}
				{props.content}
				{props.composer}
				{props.me?.list}
				{props.me?.pages.map((page) => (
					<div key={page.key}>{page.content}</div>
				))}
				{props.me && (
					<button type="button" onClick={props.me.onClose}>
						Close me
					</button>
				)}
			</>
		);
	},
}));
vi.mock("@yonder/feature-me", () => ({
	isMeSection: (value: string) => value === "account",
	MeList: ({ onOpen }: { onOpen: (id: string) => void }) => (
		<button type="button" onClick={() => onOpen("account")}>
			Open account
		</button>
	),
	MeSectionPage: ({
		page,
		onOpenPage,
		onModelDirtyChange,
	}: {
		page: string | null;
		onOpenPage: (page: string) => void;
		onModelDirtyChange: (dirty: boolean) => void;
	}) =>
		page ? (
			<div>
				Password page
				<button type="button" onClick={() => onModelDirtyChange(true)}>
					Mark dirty
				</button>
			</div>
		) : (
			<AccountPage onOpen={() => onOpenPage("password")} />
		),
}));
vi.mock("../pages/messages-page.tsx", () => ({
	MessagesList: () => <div>Chat list</div>,
	ConversationPage: ({ conversationId }: { conversationId: string | null }) => <ChatPage id={conversationId} />,
}));
vi.mock("./composer.tsx", () => ({
	Composer: ({
		draft,
		onDraftChange,
		disabled,
	}: {
		draft: string;
		onDraftChange: (value: string) => void;
		disabled: boolean;
	}) => (
		<input
			aria-label="Composer"
			value={draft}
			disabled={disabled}
			onChange={(event) => onDraftChange(event.target.value)}
		/>
	),
}));

function ChatPage({ id }: { id: string | null }) {
	const [value, setValue] = useState("");
	return (
		<input
			aria-label="Chat state"
			data-conversation={id}
			value={value}
			onChange={(event) => setValue(event.target.value)}
		/>
	);
}

function AccountPage({ onOpen }: { onOpen: () => void }) {
	const [value, setValue] = useState("");
	return (
		<>
			<input aria-label="Account state" value={value} onChange={(event) => setValue(event.target.value)} />
			<button type="button" onClick={onOpen}>
				Open password
			</button>
		</>
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("Me layers preserve the selected chat, composer, parent instance and original history entry", async () => {
	const router = createMemoryRouter([{ path: "*", element: <AppFrame /> }], {
		initialEntries: ["/messages/main?source=list#latest"],
	});
	render(<RouterProvider router={router} />);
	const rootKey = router.state.location.key;
	const chat = screen.getByRole("textbox", { name: "Chat state" });
	const composer = screen.getByRole("textbox", { name: "Composer" });
	await waitFor(() => expect(composer).toBeEnabled());
	fireEvent.change(chat, { target: { value: "retained scroll state" } });
	fireEvent.change(composer, { target: { value: "unsent draft" } });
	await act(() => fireEvent.click(screen.getByRole("button", { name: "Open me" })));
	await act(() => fireEvent.click(screen.getByRole("button", { name: "Open account" })));
	const account = screen.getByRole("textbox", { name: "Account state" });
	fireEvent.change(account, { target: { value: "parent state" } });
	await act(() => fireEvent.click(screen.getByRole("button", { name: "Open password" })));
	expect(screen.getByText("Password page")).toBeInTheDocument();
	expect(screen.getByRole("textbox", { name: "Account state" })).toBe(account);
	expect(screen.getByRole("textbox", { name: "Chat state" })).toBe(chat);
	expect(chat).toHaveAttribute("data-conversation", "conversation");
	expect(chat).toHaveValue("retained scroll state");
	expect(screen.getByRole("textbox", { name: "Composer" })).toBe(composer);
	expect(composer).toHaveValue("unsent draft");
	await act(() => fireEvent.click(screen.getByRole("button", { name: "Back" })));
	expect(router.state.location.pathname).toBe("/me/account");
	expect(account).toHaveValue("parent state");
	await act(() => fireEvent.click(screen.getByRole("button", { name: "Close me" })));
	expect(router.state.location.key).toBe(rootKey);
	expect(router.state.location.search).toBe("?source=list");
	expect(router.state.location.hash).toBe("#latest");
	expect(composer).toHaveValue("unsent draft");
	router.dispose();
});

test("a refused dirty-form exit leaves the route and page in place", async () => {
	const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
	const router = createMemoryRouter([{ path: "*", element: <AppFrame /> }], {
		initialEntries: ["/me/account/password"],
	});
	render(<RouterProvider router={router} />);
	const page = screen.getByText("Password page");
	fireEvent.click(screen.getByRole("button", { name: "Mark dirty" }));
	await act(() => fireEvent.click(screen.getByRole("button", { name: "Back" })));
	expect(confirm).toHaveBeenCalledWith("models.discard");
	expect(router.state.location.pathname).toBe("/me/account/password");
	expect(screen.getByText("Password page")).toBe(page);
	confirm.mockReturnValue(true);
	await act(() => fireEvent.click(screen.getByRole("button", { name: "Back" })));
	expect(router.state.location.pathname).toBe("/me/account");
	expect(router.state.historyAction).toBe("REPLACE");
	router.dispose();
});

test("a departing page's retained Back callback returns through the current route", async () => {
	const router = createMemoryRouter([{ path: "*", element: <AppFrame /> }], { initialEntries: ["/messages"] });
	render(<RouterProvider router={router} />);
	await act(() => fireEvent.click(screen.getByRole("button", { name: "Open me" })));
	await act(() => router.navigate("/me/about", { state: { tabLocation: "/messages" } }));
	const departingBack = capturedShell.back;
	expect(departingBack).toBeTypeOf("function");
	await act(() => departingBack?.());
	expect(router.state.location.pathname).toBe("/me");
	expect(capturedShell.back).toBe(departingBack);
	await act(() => departingBack?.());
	expect(router.state.location.pathname).toBe("/messages");
	expect(router.state.historyAction).toBe("POP");
	router.dispose();
});

test("a second Escape while the first layer leaves still exits the screen behind it", async () => {
	const router = createMemoryRouter([{ path: "*", element: <AppFrame /> }], { initialEntries: ["/messages"] });
	render(<RouterProvider router={router} />);
	await act(() => fireEvent.click(screen.getByRole("button", { name: "Open me" })));
	await act(() => router.navigate("/me/account", { state: { tabLocation: "/messages" } }));
	const exit = capturedShell.back;
	await act(() => exit?.());
	expect(router.state.location.pathname).toBe("/me");
	// The departing section layer still holds its old props; the exit must follow the live route.
	await act(() => exit?.());
	expect(router.state.location.pathname).toBe("/messages");
	router.dispose();
});

test("an auxiliary contact window can open a chat while the main window is on another tab or Me", async () => {
	const router = createMemoryRouter([{ path: "*", element: <AppFrame /> }], { initialEntries: ["/tasks"] });
	render(<RouterProvider router={router} />);
	await waitFor(() => expect(listenForContactAdded.mock.calls.length).toBeGreaterThan(0));
	const listener = listenForContactAdded.mock.calls.at(-1)?.[0];
	expect(listener).toBeTypeOf("function");
	await act(() => listener?.("contact-direct"));
	expect(router.state.location.pathname).toBe("/messages/contact-direct");
	expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["conversations", "list"] });
	expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["contacts"] });
	await act(() => fireEvent.click(screen.getByRole("button", { name: "Open me" })));
	await act(() => listener?.("another-direct"));
	expect(router.state.location.pathname).toBe("/messages/another-direct");
	router.dispose();
});
