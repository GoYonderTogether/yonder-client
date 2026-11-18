// @vitest-environment jsdom
import { ApiError } from "@yonder/api-client";
import type { Conversation, Member } from "@yonder/protocol";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, test, vi } from "vitest";

type ModalResult = { confirm: boolean; cancel: boolean };
const mock = vi.hoisted(() => ({
	bot: null as Member | null,
	view: undefined as "edit" | undefined,
	update: vi.fn(),
	remove: vi.fn(),
	modal: vi.fn(async (): Promise<ModalResult> => ({ confirm: true, cancel: false })),
	reLaunch: vi.fn(async () => ({})),
	navigateTo: vi.fn(async () => ({})),
	conversations: vi.fn(async (): Promise<{ items: Conversation[] }> => ({ items: [] })),
	schedules: vi.fn(async () => ({ items: [{ conversationId: "chat_1" }] })),
	refreshMe: vi.fn(async () => {}),
}));

vi.mock("@tarojs/taro", () => ({
	default: {
		showModal: mock.modal,
		showToast: vi.fn(async () => ({})),
		reLaunch: mock.reLaunch,
		navigateTo: mock.navigateTo,
		navigateBack: vi.fn(async () => ({})),
		getCurrentPages: () => [{ route: "pages/bot/index" }],
		getStorageSync: () => "en",
		setStorageSync: () => {},
		getSystemInfoSync: () => ({ language: "en" }),
		getWindowInfo: () => ({ windowWidth: 390, statusBarHeight: 0 }),
		getMenuButtonBoundingClientRect: () => ({ top: 0, height: 0, left: 0 }),
	},
	useRouter: () => ({ params: { id: "bot_1", view: mock.view } }),
	useDidShow: () => {},
	useLocale: () => ({ locale: "en" }),
}));
/**
 * The Taro host elements are not React components under vitest; plain tags render the same tree.
 * Taro's own prop names are translated so React does not warn about them in a DOM host.
 */
vi.mock("@tarojs/components", async () => {
	const { createElement } = await import("react");
	const host =
		(tag: string) =>
		({ ariaLabel, ariaRole, ariaSelected, openType, loading, disabled, ...rest }: Record<string, unknown>) =>
			createElement(tag, {
				...rest,
				...(ariaLabel ? { "aria-label": ariaLabel } : {}),
				...(ariaRole ? { role: ariaRole } : {}),
				...(ariaSelected ? { "aria-selected": true } : {}),
				...(openType || loading ? { "data-taro": true } : {}),
				...(disabled ? { disabled: true } : {}),
			});
	return { Image: host("img"), Input: host("input"), Text: host("span"), View: host("div"), Button: host("button") };
});

const bot = (overrides: Partial<Member> = {}): Member => ({
	id: "bot_1",
	kind: "bot",
	handle: "abc123xyz",
	displayName: "Yonder",
	avatarUrl: null,
	avatarColor: "2",
	bio: null,
	ownerId: "mem_1",
	isDefault: false,
	createdAt: "2026-01-01T00:00:00.000Z",
	version: 1,
	...overrides,
});

vi.mock("../../lib/runtime", () => ({
	client: { baseUrl: "http://server" },
	useSession: () => ({ status: "signed-in", me: { member: { id: "mem_1" } }, refreshMe: mock.refreshMe }),
	subscribeEvents: () => () => {},
	api: {
		contacts: async () => ({ items: mock.bot ? [mock.bot] : [] }),
		conversations: mock.conversations,
		schedules: mock.schedules,
		updateBot: mock.update,
		deleteBot: mock.remove,
	},
}));
vi.mock("./image", () => ({ chooseAvatar: async () => undefined, uploadBotAvatar: async () => bot() }));

/**
 * `Field` reads a Taro `event.detail.value`; jsdom dispatches a DOM event with no `detail`, so the
 * field is rendered as a plain controlled input here. Everything else on the page is real.
 */
vi.mock("../../components/ui", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../components/ui")>();
	const { createElement } = await import("react");
	return {
		...original,
		Field: ({ label, value, onInput }: { label: string; value: string; onInput: (value: string) => void }) =>
			createElement("input", {
				"aria-label": label,
				value,
				onChange: (event: { target: { value: string } }) => onInput(event.target.value),
			}),
	};
});

import BotPage from "./index";

const refusal = (code: string) => new ApiError({ code: code as never, status: 409, message: `server says ${code}` });
const buttons = (host: HTMLElement) => [...host.querySelectorAll("button")];
const byText = (host: HTMLElement, text: string) => buttons(host).find((button) => button.textContent === text);
const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};
async function render(view?: "edit") {
	mock.view = view;
	const host = document.createElement("div");
	const root = createRoot(host);
	await act(async () => root.render(createElement(BotPage)));
	await act(flush);
	return { host, root };
}
async function rename(host: HTMLElement, value: string) {
	const input = host.querySelector("input");
	if (!input) throw new Error("the page has no name field");
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	await act(async () => {
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

beforeEach(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	mock.bot = bot();
	mock.update.mockReset().mockResolvedValue(bot({ displayName: "Second", version: 2 }));
	mock.remove.mockReset().mockResolvedValue(undefined);
	mock.modal.mockReset().mockResolvedValue({ confirm: true, cancel: false });
	mock.reLaunch.mockReset().mockResolvedValue({});
	mock.navigateTo.mockClear();
	mock.conversations.mockReset().mockResolvedValue({ items: [] });
	mock.schedules.mockReset().mockResolvedValue({ items: [{ conversationId: "chat_1" }] });
});

test("Bot details show a read-only card and an edit link, with delete for extra Bots only", async () => {
	mock.bot = bot({ isDefault: true });
	const first = await render();
	expect(first.host.textContent).toContain("ID @abc123xyz");
	expect(first.host.querySelector("input")).toBeNull();
	expect(byText(first.host, "Upload avatar")).toBeUndefined();
	expect(first.host.textContent).not.toContain("Delete this bot");
	await act(async () => byText(first.host, "Edit")?.click());
	expect(mock.navigateTo).toHaveBeenCalledWith({ url: "/pages/bot/index?id=bot_1&view=edit" });
	await act(async () => first.root.unmount());

	mock.bot = bot({ isDefault: false });
	const second = await render();
	expect(second.host.textContent).toContain("Delete this bot");
	await act(async () => second.root.unmount());
});

test("a blank name is refused on the edit page and never sent", async () => {
	const { host, root } = await render("edit");
	expect(host.querySelector("input")).toHaveProperty("value", "Yonder");
	await rename(host, "   ");
	expect(host.textContent).toContain("A name is required");
	expect(byText(host, "Save")).toHaveProperty("disabled", true);
	await act(async () => byText(host, "Save")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
	expect(mock.update).not.toHaveBeenCalled();
	await act(async () => root.unmount());
});

test("a save sends only the changed field and shows the server's refusal, not a friendly line", async () => {
	mock.update.mockRejectedValueOnce(refusal("default_bot_protected"));
	const { host, root } = await render("edit");
	await rename(host, "Second");
	await act(async () => {
		byText(host, "Save")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	await act(flush);
	expect(mock.update).toHaveBeenCalledWith("bot_1", { displayName: "Second" });
	expect(host.textContent).toContain("The default bot cannot be deleted");
	expect(host.textContent).not.toContain("server says default_bot_protected");
	await act(async () => root.unmount());
});

test("delete asks first, names the plans going with the Bot, then returns to the conversation list", async () => {
	mock.conversations.mockResolvedValue({
		items: [
			{
				id: "chat_1",
				kind: "direct",
				title: null,
				members: [{ memberId: "bot_1", kind: "bot", handle: "h", displayName: "Yonder", avatarUrl: null }],
				lastMessageAt: null,
				unreadCount: 0,
				pinned: false,
				version: 1,
			},
		],
	});
	const { host, root } = await render();
	await act(async () => {
		byText(host, "Delete this bot")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	await act(flush);
	expect(mock.modal).toHaveBeenCalledWith(
		expect.objectContaining({ content: expect.stringContaining("1 scheduled plan") }),
	);
	expect(mock.remove).toHaveBeenCalledWith("bot_1");
	expect(mock.reLaunch).toHaveBeenCalledWith({ url: "/pages/conversations/index" });
	await act(async () => root.unmount());
});

test("a declined confirmation deletes nothing", async () => {
	mock.modal.mockResolvedValueOnce({ confirm: false, cancel: true });
	const { host, root } = await render();
	await act(async () => {
		byText(host, "Delete this bot")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
	await act(flush);
	expect(mock.remove).not.toHaveBeenCalled();
	await act(async () => root.unmount());
});
