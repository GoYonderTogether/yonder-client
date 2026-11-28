import { keys, useDataQueryClient } from "@yonder/ui-data";
import { useEffect, useEffectEvent } from "react";
import { listenForContactAdded } from "../lib/contact-window.ts";
import type { usePageNavigation } from "./use-page-navigation.ts";

/** A contact added from the auxiliary window refreshes the lists and opens its chat here. */
export function useContactAdded(navigation: ReturnType<typeof usePageNavigation>) {
	const queryClient = useDataQueryClient();
	const contactAdded = useEffectEvent((id: string) => {
		void queryClient.invalidateQueries({ queryKey: keys.conversations.list() });
		void queryClient.invalidateQueries({ queryKey: keys.contacts() });
		navigation.open(`/messages/${encodeURIComponent(id)}`);
	});
	useEffect(() => {
		let disposed = false;
		let cleanup: (() => void) | undefined;
		void listenForContactAdded((id) => contactAdded(id)).then((unlisten) => {
			if (disposed) unlisten();
			else cleanup = unlisten;
		});
		return () => {
			disposed = true;
			cleanup?.();
		};
	}, []);
}
