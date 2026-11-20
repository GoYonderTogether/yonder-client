// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { ConnectorRequestView, ServerEvent } from "@yonder/protocol";
import { expect, test, vi } from "vitest";
import { ConnectorContinuationNotices } from "./connector-continuation-notices.tsx";

const state = vi.hoisted(() => ({
	foreground: true,
	show: vi.fn(),
	dismiss: vi.fn(),
	listener: undefined as ((event: ServerEvent) => void) | undefined,
}));
vi.mock("@yonder/ui-data", () => ({
	useData: () => ({
		realtime: {
			subscribeEvents(listener: (event: ServerEvent) => void) {
				state.listener = listener;
				return () => {
					state.listener = undefined;
				};
			},
		},
	}),
}));
vi.mock("./app-notice.tsx", () => ({
	useAppNotice: () => state.show,
	useDismissAppNotice: () => state.dismiss,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../lib/foreground.ts", () => ({ isForeground: () => state.foreground }));

test("only live terminal continuation failures notify once per foreground episode", () => {
	const send = (id: string, continuation: NonNullable<ConnectorRequestView["continuation"]>) =>
		state.listener?.({
			type: "connector_request.updated",
			at: new Date().toISOString(),
			eventId: `${id}-${continuation}`,
			request: {
				id,
				state: "granted",
				continuation,
				connectorIds: ["local-files"],
				deviceId: "desktop",
				deviceName: "Desktop",
				connectionIds: ["local"],
				reason: "Read a file",
				failure: null,
			},
		});
	const card = render(<ConnectorContinuationNotices />);
	send("request", "pending");
	state.foreground = false;
	send("other", "failed");
	state.foreground = true;
	send("other", "failed");
	expect(state.show).not.toHaveBeenCalled();
	send("request", "failed");
	send("request", "failed");
	expect(state.show).toHaveBeenCalledExactlyOnceWith({
		key: "connector-continuation:request",
		text: "connectors.requestContinuation.failed",
		tone: "warning",
	});
	state.dismiss.mockClear();
	send("request", "pending");
	expect(state.dismiss).toHaveBeenCalledWith("connector-continuation:request");
	send("request", "started");
	send("request", "failed");
	expect(state.show).toHaveBeenCalledTimes(1);
	card.unmount();
	expect(state.listener).toBeUndefined();
});
