import { useSessionStore } from "@yonder/ui-data";
import { useEffect, useEffectEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { listenForTrayMainAction, type TrayMainAction } from "../../lib/tray-bridge.ts";
import { useUpdater } from "../../updates/provider.tsx";

/** Native raises the main window; make the requested action use its existing route and updater. */
export function TrayMainActions() {
	const navigate = useNavigate();
	const location = useLocation();
	const updater = useUpdater();
	const signedIn = useSessionStore((state) => state.status === "signed-in");
	const handle = useEffectEvent((action: TrayMainAction) => {
		if (action === "check-updates") {
			void updater?.check();
			if (!signedIn) return;
		}
		const path = `${location.pathname}${location.search}${location.hash}`;
		const tabLocation = location.pathname.startsWith("/me") ? (location.state?.tabLocation ?? "/messages") : path;
		void navigate(action === "settings" ? "/me" : "/me/about", { state: { tabLocation } });
	});
	useEffect(() => {
		let disposed = false;
		let cleanup: (() => void) | undefined;
		void listenForTrayMainAction((action) => handle(action))
			.then((stop) => {
				if (disposed) stop();
				else cleanup = stop;
			})
			.catch(() => {});
		return () => {
			disposed = true;
			cleanup?.();
		};
	}, []);
	return null;
}
