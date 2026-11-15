import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";
import { updateDriver, updatePlatform } from "./drivers.ts";
import { createUpdater, type Updater } from "./state.ts";

const UpdateContext = createContext<Updater | null>(null);

/** The check runs for the lifetime of the app, including while signed out. */
export function UpdateProvider({ children }: { children: ReactNode }) {
	const updater = useMemo(() => {
		const platform = updatePlatform();
		return platform ? createUpdater(updateDriver(platform)) : null;
	}, []);
	useEffect(() => {
		if (!updater) return;
		void updater.check();
		const hours = updater.platform === "desktop" ? 6 : 24;
		const timer = window.setInterval(() => void updater.check(), hours * 60 * 60 * 1000);
		return () => window.clearInterval(timer);
	}, [updater]);
	return <UpdateContext.Provider value={updater}>{children}</UpdateContext.Provider>;
}

export function useUpdater() {
	return useContext(UpdateContext);
}
