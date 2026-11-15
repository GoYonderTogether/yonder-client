import { DownloadView } from "@yonder/feature-landing";
import { BUILD_VERSION } from "../lib/config.ts";

export function DownloadPage() {
	return <DownloadView version={BUILD_VERSION} iosUrl={import.meta.env.VITE_IOS_DOWNLOAD_URL ?? ""} />;
}
