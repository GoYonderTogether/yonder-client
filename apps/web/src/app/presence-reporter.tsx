import { type PresenceReporter as Reporter, usePresenceReport } from "@yonder/ui-data";
import { useMemo } from "react";
import { isForeground, subscribeForeground } from "../lib/foreground.ts";

/**
 * Tells the server where this device is, so it does not push a message the screen already shows
 * (docs/notifications.md 第二节). Mounted by the frame, which is the only place that knows which
 * conversation is open.
 */
export function PresenceReporter({ conversationId }: { conversationId: string | null }) {
	const reporter = useMemo<Reporter>(() => ({ foreground: isForeground, subscribe: subscribeForeground }), []);
	usePresenceReport(reporter, conversationId);
	return null;
}
