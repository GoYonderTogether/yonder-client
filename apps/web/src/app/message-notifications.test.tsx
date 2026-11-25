// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import type { ServerEvent } from "@yonder/protocol";
import { expect, test, vi } from "vitest";
import { MessageNotifications } from "./message-notifications.tsx";

const desktop = vi.hoisted(() => ({
	foreground: true,
	listener: undefined as ((event: ServerEvent) => void) | undefined,
	show: vi.fn(async () => true),
}));
vi.mock("@yonder/ui-data", () => ({
	useData: () => ({
		realtime: {
			subscribeEvents(listener: (event: ServerEvent) => void) {
				desktop.listener = listener;
				return () => {
					desktop.listener = undefined;
				};
			},
		},
	}),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../lib/foreground.ts", () => ({ isForeground: () => desktop.foreground }));
vi.mock("../lib/keychain.ts", () => ({ isTauri: () => true }));
vi.mock("../lib/native-notifications.ts", () => ({
	isNativeMobileNotifications: () => false,
	listenNativeNotificationOpen: async () => () => {},
	showDesktopNotification: desktop.show,
}));

test("foreground never presents an alert and the background presents each new notification once", async () => {
	const send = (id: string) =>
		desktop.listener?.({
			type: "notification.created",
			at: "2026-11-19T00:00:00Z",
			eventId: id,
			notification: {
				id,
				kind: "message",
				conversationId: "cnv_chat",
				messageId: "msg_chat",
				senderName: "Friend",
				senderKind: "person",
				body: "See you at nine.",
			},
		});
	const view = render(<MessageNotifications personId="mem_owner" conversationId={null} onOpen={vi.fn()} />);
	await act(async () => send("foreground"));
	expect(view.container.childElementCount).toBe(0);
	expect(desktop.show).not.toHaveBeenCalled();

	desktop.foreground = false;
	await act(async () => {
		send("foreground");
		send("background");
		send("background");
	});
	expect(desktop.show).toHaveBeenCalledExactlyOnceWith({
		notificationId: "background",
		conversationId: "cnv_chat",
		messageId: "msg_chat",
		recipientMemberId: "mem_owner",
		title: "Friend",
		body: "See you at nine.",
	});
});
