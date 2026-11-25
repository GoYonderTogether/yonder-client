import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";
import { updateDriver, updatePlatform } from "./drivers.ts";
import { scheduleUpdateChecks } from "./schedule.ts";
import { createUpdater, type Updater } from "./state.ts";
import { useUpdateOffer } from "./update-offer.ts";

const UpdateContext = createContext<Updater | null>(null);
const OfferContext = createContext<ReturnType<typeof useUpdateOffer> | null>(null);

/**
 * The updater lives as long as the window does, signed in or not: it reads the public release
 * feed, so a new build is found and downloaded before the server has a session to hint at it.
 */
export function UpdateProvider({ children }: { children: ReactNode }) {
	const updater = useMemo(() => {
		const platform = updatePlatform();
		return platform ? createUpdater(updateDriver(platform)) : null;
	}, []);
	useEffect(() => {
		if (!updater) return;
		const schedule = scheduleUpdateChecks(() => updater.check());
		return () => schedule.stop();
	}, [updater]);
	return <UpdateContext.Provider value={updater}>{children}</UpdateContext.Provider>;
}

export function UpdateOfferProvider({
	children,
	owner,
	devicePlatform,
}: {
	children: ReactNode;
	owner?: string | undefined;
	devicePlatform: string;
}) {
	const offer = useUpdateOffer(owner, devicePlatform);
	return <OfferContext.Provider value={offer}>{children}</OfferContext.Provider>;
}

export function useUpdater() {
	return useContext(UpdateContext);
}

export function useOfferedUpdate() {
	return useContext(OfferContext);
}
