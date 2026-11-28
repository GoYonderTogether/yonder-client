/**
 * Connects the realtime socket to the query cache for as long as the session lives. Mounted once,
 * by the app, inside the data provider.
 */
import { useEffect } from "react";
import { useSessionStore } from "../auth/session-store.ts";
import { chatOutbox, type PrepareOutgoingFile } from "../hooks/chat-outbox.ts";
import { keys } from "../query/keys.ts";
import { useData, useDataQueryClient } from "../query/provider.tsx";
import { applyServerEvent, reconcileRealtime } from "./events.ts";

export function useRealtimeSync(prepareOutgoingFile?: PrepareOutgoingFile): void {
	const { api, client, realtime, signOutLocal } = useData();
	const queryClient = useDataQueryClient();
	const outbox = chatOutbox(queryClient, api);
	const status = useSessionStore((state) => state.status);

	useEffect(() => {
		if (status !== "signed-in") {
			realtime.stop();
			return;
		}
		const stopOutbox = outbox.start(
			() => client.accessToken,
			() => client.refreshSession({ throwOnUnavailable: true }),
			prepareOutgoingFile,
		);
		realtime.connect();
		const resume = () => {
			realtime.resume();
			outbox.resume();
		};
		const online = () => {
			realtime.resume(true);
			outbox.resume();
		};
		const visible = () => {
			if (document.visibilityState === "visible") resume();
		};
		const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
			if (event.type === "updated" && event.action.type === "success" && event.query.queryKey[0] === keys.me()[0])
				outbox.resume();
		});
		window.addEventListener("online", online);
		window.addEventListener("focus", resume);
		document.addEventListener("visibilitychange", visible);
		return () => {
			stopOutbox();
			unsubscribe();
			window.removeEventListener("online", online);
			window.removeEventListener("focus", resume);
			document.removeEventListener("visibilitychange", visible);
			realtime.stop();
		};
	}, [client, outbox, prepareOutgoingFile, queryClient, realtime, status]);

	useEffect(() => {
		// The connection is created with callbacks; rebinding here keeps them current without
		// rebuilding the socket on every render.
		realtime.setHandlers({
			onStatus: (status) => {
				if (status === "open") {
					reconcileRealtime(queryClient);
					outbox.resume();
				}
			},
			onEvent: (event) =>
				applyServerEvent(queryClient, event, {
					onSessionLost: () => void signOutLocal(),
				}),
			onSessionLost: () => void signOutLocal(),
		});
	}, [outbox, realtime, queryClient, signOutLocal]);
}
