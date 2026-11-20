import { LandingView } from "@yonder/feature-landing";
import { useSessionStore } from "@yonder/ui-data";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { BUILD_VERSION } from "../lib/config.ts";
import { defaultMessagePath } from "../lib/default-message-path.ts";
import { isTauri } from "../lib/keychain.ts";
import { Splash } from "./splash.tsx";

export function LandingPage() {
	const status = useSessionStore((state) => state.status);
	const booting = useSessionStore((state) => state.booting);
	const [waited, setWaited] = useState(false);

	useEffect(() => {
		if (isTauri() || (!booting && status !== "unknown")) return;
		const timeout = setTimeout(() => setWaited(true), 3000);
		return () => clearTimeout(timeout);
	}, [booting, status]);

	if ((booting || status === "unknown") && (isTauri() || !waited)) return <Splash />;
	if (status === "signed-in") return <Navigate to={defaultMessagePath()} replace />;
	if (isTauri()) return <Navigate to="/sign-in" replace />;
	return <LandingView version={BUILD_VERSION} iosUrl={import.meta.env.VITE_IOS_DOWNLOAD_URL ?? ""} />;
}
