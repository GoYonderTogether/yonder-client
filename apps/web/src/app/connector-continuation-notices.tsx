import type { ConnectorRequestView } from "@yonder/protocol";
import { useData } from "@yonder/ui-data";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { isForeground } from "../lib/foreground.ts";
import { useAppNotice, useDismissAppNotice } from "./app-notice.tsx";

/** Cached cards and reconnect refetches show their state without announcing an old failure. */
export function ConnectorContinuationNotices() {
	const { realtime } = useData();
	const { t } = useTranslation();
	const notify = useAppNotice();
	const dismiss = useDismissAppNotice();
	const latest = useRef(new Map<string, NonNullable<ConnectorRequestView["continuation"]>>());
	useEffect(
		() =>
			realtime.subscribeEvents((event) => {
				if (event.type !== "connector_request.updated" || event.request.state !== "granted") return;
				const { id, continuation, continuationFailure } = event.request;
				const previous = latest.current.get(id);
				if (!continuation || previous === continuation || previous === "started") return;
				latest.current.set(id, continuation);
				const key = `connector-continuation:${id}`;
				if (continuation !== "failed") dismiss(key);
				else if (isForeground())
					notify({
						key,
						text: t(`connectors.requestContinuation.${continuationFailure ?? "failed"}`),
						tone: "warning",
					});
			}),
		[realtime, notify, dismiss, t],
	);
	return null;
}
