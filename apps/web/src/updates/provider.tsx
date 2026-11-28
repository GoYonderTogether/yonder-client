import { useUpdateChannel } from "@yonder/ui-data";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { NATIVE_BUILD_CHANNEL } from "../lib/config.ts";
import { updateDriver, updatePlatform } from "./drivers.ts";
import { createUpdater, type Updater } from "./state.ts";
import { useUpdateOffer } from "./update-offer.ts";

const UpdateContext = createContext<Updater | null>(null);
const ChannelContext = createContext<ReturnType<typeof useUpdateChannel> | null>(null);
const OfferContext = createContext<ReturnType<typeof useUpdateOffer> | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
	const settings = useUpdateSettings();
	const readOffer = useOfferedUpdate()?.readOffer;
	const channel = settings?.state.data?.channel;
	const remote = NATIVE_BUILD_CHANNEL === "beta" || channel === "beta" ? readOffer : undefined;
	const updater = useMemo(() => {
		const platform = updatePlatform();
		return platform ? createUpdater(updateDriver(platform, remote)) : null;
	}, [remote]);
	return <UpdateContext.Provider value={updater}>{children}</UpdateContext.Provider>;
}

export function UpdateOfferProvider({
	children,
	owner,
	devicePlatform,
	activePreview = false,
	offersEnabled = true,
}: {
	children: ReactNode;
	owner?: string | undefined;
	devicePlatform: string;
	activePreview?: boolean;
	offersEnabled?: boolean;
}) {
	const preview = activePreview || NATIVE_BUILD_CHANNEL === "beta";
	const settings = useUpdateChannel(owner, preview);
	const channel = settings.state.data?.channel;
	const offer = useUpdateOffer(
		offersEnabled && (!preview || channel) ? owner : undefined,
		devicePlatform,
		channel ?? "stable",
	);
	return (
		<ChannelContext.Provider value={settings}>
			<OfferContext.Provider value={offer}>{children}</OfferContext.Provider>
		</ChannelContext.Provider>
	);
}

export function useUpdater() {
	return useContext(UpdateContext);
}

export function useOfferedUpdate() {
	return useContext(OfferContext);
}

export function useUpdateSettings() {
	return useContext(ChannelContext);
}
