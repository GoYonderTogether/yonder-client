import { DownloadView } from "@yonder/feature-landing";
import { useSearchParams } from "react-router";
import { BUILD_VERSION } from "../lib/config.ts";

export function DownloadPage() {
	const [params] = useSearchParams();
	return (
		<DownloadView
			version={BUILD_VERSION}
			iosUrl={import.meta.env.VITE_IOS_DOWNLOAD_URL ?? ""}
			connectDevice={params.has("connect-device")}
			connectorPlatforms={params.getAll("platform")}
		/>
	);
}
