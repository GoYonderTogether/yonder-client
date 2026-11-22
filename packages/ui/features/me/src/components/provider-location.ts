import type { DeviceSummary } from "@yonder/protocol";
import type { useTranslation } from "react-i18next";
import { deviceDisplayName } from "./device-display-name.ts";

export type RegisterLocalProviderEndpoint = (
	input:
		| { deviceId: string; baseUrl: string; label?: string; apiKey?: string }
		| { deviceId: string; endpointId: string; apiKey: string },
) => Promise<{ endpointId: string; revision: number; label: string }>;

export const CLOUD_PROVIDER = "cloud";
export const NEW_ENDPOINT = "new-local-endpoint";

export function isLoopbackProviderAddress(address: string) {
	try {
		const url = new URL(address.trim());
		return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
	} catch {
		return false;
	}
}

export function isLocalProviderAddress(address: string) {
	try {
		const url = new URL(address.trim());
		return (
			url.protocol === "http:" &&
			isLoopbackProviderAddress(address) &&
			["/", "/v1", "/v1/"].includes(url.pathname) &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash
		);
	} catch {
		return false;
	}
}

export function providerDeviceLabel(device: DeviceSummary, t: ReturnType<typeof useTranslation>["t"], locale: string) {
	const when = new Date(device.lastSeenAt);
	const at = Number.isNaN(when.getTime())
		? ""
		: new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(when);
	const status =
		device.status === "online"
			? t("models.deviceOnline")
			: at
				? t("models.deviceLastSeen", { at })
				: t("models.deviceOffline");
	return `${deviceDisplayName(device)} · ${status}`;
}
