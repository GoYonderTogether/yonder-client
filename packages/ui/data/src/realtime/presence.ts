/**
 * Where this device is, reported on the socket so the server can skip a push for a message it is
 * already showing (`yonder/docs/notifications.md` 第二节).
 *
 * The report is per socket and is re-sent whenever the socket opens again: a reconnect starts from
 * "background" on the server's side, and the first thing this hook does is say otherwise.
 */
import { useEffect } from "react";
import { useSessionStore } from "../auth/session-store.ts";
import { useData } from "../query/provider.tsx";

export interface PresenceReporter {
	/** Whether the app's window is in front of the person. */
	foreground: () => boolean;
	/** Subscribe to focus/visibility changes; the caller re-reports from the callback. */
	subscribe: (change: () => void) => () => void;
}

/**
 * Mounted once by the app, next to `useRealtimeSync`. `conversationId` is what the screen shows;
 * null while the person is anywhere else in the app.
 */
export function usePresenceReport(reporter: PresenceReporter, conversationId: string | null): void {
	const { realtime } = useData();
	const status = useSessionStore((state) => state.status);
	useEffect(() => {
		if (status !== "signed-in") return;
		const report = () => {
			realtime.send({
				type: "presence",
				foreground: reporter.foreground(),
				...(conversationId ? { conversationId } : {}),
			});
		};
		report();
		// A socket that reopened has forgotten this device's state; the status listener reports again.
		const unsubscribeStatus = realtime.subscribe(report);
		const unsubscribeFocus = reporter.subscribe(report);
		return () => {
			unsubscribeStatus();
			unsubscribeFocus();
		};
	}, [realtime, reporter, conversationId, status]);
}
