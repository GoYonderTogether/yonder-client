import { createContext, type ReactNode, useContext, useMemo } from "react";
import { updateDriver, updatePlatform } from "./drivers.ts";
import { createUpdater, type Updater } from "./state.ts";
import { useUpdateOffer } from "./update-offer.ts";

const UpdateContext = createContext<Updater | null>(null);
const OfferContext = createContext<ReturnType<typeof useUpdateOffer> | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
	const updater = useMemo(() => {
		const platform = updatePlatform();
		return platform ? createUpdater(updateDriver(platform)) : null;
	}, []);
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
