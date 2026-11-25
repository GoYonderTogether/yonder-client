import type { DeviceModelEndpoint, DeviceModelProtocol, DeviceSummary, Provider } from "@yonder/protocol";
import { formatInstant } from "@yonder/ui-time";
import type { useTranslation } from "react-i18next";
import { deviceDisplayName } from "./device-display-name.ts";

export type RegisterLocalProviderEndpoint = (
	input: // A device endpoint advertises one of the two device wires, not the four upstream names.
		| { deviceId: string; baseUrl: string; protocol?: DeviceModelProtocol; label?: string; apiKey?: string }
		| { deviceId: string; endpointId: string; protocol?: DeviceModelProtocol; apiKey: string },
) => Promise<Omit<DeviceModelEndpoint, "protocol"> & { protocol?: DeviceModelProtocol }>;

export interface NativeProviderBinding {
	deviceId: string;
	endpointId: string;
}

export interface ProviderPreset {
	id: string;
	name: string;
	baseUrl: string;
	models: string;
	keyUrl: string | null;
	/** The four wire names, or a preset predating them naming `openai`/`anthropic`. */
	protocol?: Provider["protocol"] | "openai" | "anthropic";
	target?: NativeProviderBinding | undefined;
	note?: string | null;
	website?: string | null;
}

export type ProviderAddFailure = (phase: "save" | "discover", error: unknown, startedAt: number) => void;

export function localProviderBinding(provider?: Provider): NativeProviderBinding | undefined {
	return provider?.origin === "device" && provider.deviceId && provider.endpointId
		? { deviceId: provider.deviceId, endpointId: provider.endpointId }
		: undefined;
}

export function isLegacyDeviceProvider(provider: Provider) {
	return provider.origin === "device" && !localProviderBinding(provider);
}

export interface RegisteredLocalProviderEndpoint {
	baseUrl: string;
	protocol: DeviceModelProtocol;
	target: NativeProviderBinding;
	revision: number;
}

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

export function providerDeviceLabel(
	device: DeviceSummary,
	t: ReturnType<typeof useTranslation>["t"],
	locale: string,
	/** The account's zone, so "last seen" reads the same on every device of the account. */
	zone: string,
) {
	const at = formatInstant(device.lastSeenAt, { zone, locale, style: "dateTime", width: "short" });
	const status =
		device.status === "online"
			? t("models.deviceOnline")
			: at
				? t("models.deviceLastSeen", { at })
				: t("models.deviceOffline");
	return `${deviceDisplayName(device)} · ${status}`;
}

export function isHttpsAddress(value: string): boolean {
	try {
		const url = new URL(value.trim());
		return (
			url.protocol === "https:" &&
			!isLoopbackProviderAddress(value) &&
			Boolean(url.hostname) &&
			!url.username &&
			!url.password &&
			!url.search &&
			!url.hash
		);
	} catch {
		return false;
	}
}

export function normaliseUrl(value: string): string {
	return value.trim().replace(/\/+$/, "");
}
