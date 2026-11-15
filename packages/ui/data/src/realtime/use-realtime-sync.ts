/**
 * Connects the realtime socket to the query cache for as long as the session lives. Mounted once,
 * by the app, inside the data provider.
 */
import { useEffect } from "react";
import { useSessionStore } from "../auth/session-store.ts";
import { useData, useDataQueryClient } from "../query/provider.tsx";
import { applyServerEvent, reconcileRealtime } from "./events.ts";

export function useRealtimeSync(): void {
	const { realtime, signOutLocal } = useData();
	const queryClient = useDataQueryClient();
	const status = useSessionStore((state) => state.status);

	useEffect(() => {
		if (status !== "signed-in") {
			realtime.stop();
			return;
		}
		realtime.connect();
		return () => realtime.stop();
	}, [realtime, status]);

	useEffect(() => {
		// The connection is created with callbacks; rebinding here keeps them current without
		// rebuilding the socket on every render.
		realtime.setHandlers({
			onStatus: (status) => {
				if (status === "open") reconcileRealtime(queryClient);
			},
			onEvent: (event) =>
				applyServerEvent(queryClient, event, {
					onSessionLost: () => void signOutLocal(),
				}),
			onSessionLost: () => void signOutLocal(),
		});
	}, [realtime, queryClient, signOutLocal]);
}
