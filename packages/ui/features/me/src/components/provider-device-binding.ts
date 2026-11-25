import type { DeviceModelProtocol, DeviceSummary, ProviderModelMetadata, ProviderProtocol } from "@yonder/protocol";
import { useProviderActions } from "@yonder/ui-data";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
	isLocalProviderAddress,
	type NativeProviderBinding,
	normaliseUrl,
	type RegisteredLocalProviderEndpoint,
	type RegisterLocalProviderEndpoint,
} from "./provider-location.ts";

/** A device endpoint the form should produce, or the reason it cannot. */
export type ResolvedTarget = { target: NativeProviderBinding } | { error: "deviceUnavailable" };

/**
 * Registering and re-resolving the device endpoint a provider will bind to.
 *
 * Registration is what makes an endpoint reachable at all: the shell only dials addresses the
 * owner approved, so the form must register the address before discovery or saving can use it.
 * The endpoint is re-resolved by polling the device list, because the ready announcement travels
 * over the realtime socket and lands a moment after the native call returns.
 */
export function useDeviceBinding(options: {
	deviceId: string;
	device: DeviceSummary | undefined;
	endpointId: string;
	localUrl: string;
	localKey: string;
	deviceProtocol: ProviderProtocol;
	canRegister: boolean;
	canSetLocalKey: boolean;
	registerEndpoint: RegisterLocalProviderEndpoint | undefined;
	version: number;
}) {
	const { t } = useTranslation();
	const actions = useProviderActions();
	const registered = useRef<RegisteredLocalProviderEndpoint | null>(null);
	const reset = () => {
		registered.current = null;
	};
	const endpoint = options.device?.modelEndpoints?.find((item) => item.endpointId === options.endpointId);
	/**
	 * A new local address the person has not typed yet is still the endpoint being created: the form
	 * has to show the address field before there is anything to validate. `resolveTarget` is where
	 * the address is actually checked, so an empty one fails there rather than hiding the field.
	 */
	const addEndpoint = Boolean(options.canRegister && !options.endpointId);
	// The caller bumps its discovery version on every change; a resolution started before it is stale.
	const versionRef = useRef(options.version);
	versionRef.current = options.version;

	async function resolveTarget(version: number): Promise<NativeProviderBinding> {
		const { deviceId, endpointId, canRegister, registerEndpoint } = options;
		// The device gateway records its endpoint as one of two wire names; a four-protocol name is
		// registered as the device wire it most resembles (see deviceWire on the server).
		const deviceProtocol: DeviceModelProtocol =
			options.deviceProtocol === "anthropic-messages" ? "anthropic" : "openai";
		const key = options.canSetLocalKey ? options.localKey.trim() : "";
		const current = options.device?.modelEndpoints?.find((item) => item.endpointId === endpointId);
		if (current && !key) return { deviceId, endpointId: current.endpointId };
		if (!registerEndpoint || !canRegister || (!current && (!addEndpoint || !isLocalProviderAddress(options.localUrl))))
			throw new Error("Unapproved local endpoint");
		const address = normaliseUrl(options.localUrl);
		const previous = registered.current;
		let target =
			!current &&
			previous?.baseUrl === address &&
			previous.target.deviceId === deviceId &&
			previous.target.deviceId === deviceId
				? previous.target
				: undefined;
		let revision = target ? previous?.revision : undefined;
		if (!target || key) {
			const local = { deviceId, baseUrl: address, protocol: deviceProtocol, label: t("models.localEndpoint") } as const;
			const result = await registerEndpoint(
				current
					? { deviceId, endpointId: current.endpointId, apiKey: key }
					: { ...local, ...(key ? { apiKey: key } : {}) },
			);
			if ((current && result.endpointId !== current.endpointId) || (result.protocol ?? "openai") !== deviceProtocol)
				throw new Error("Unexpected endpoint");
			target = { deviceId, endpointId: result.endpointId };
			revision = result.revision;
			if (!current) registered.current = { baseUrl: address, protocol: deviceProtocol, target, revision };
		}
		// The ready announcement is the acknowledgement the server can route to this endpoint; only a
		// fresh matching one may be used. Never fall back to a different endpoint.
		for (const delay of [0, 150, 350, 750]) {
			if (delay) await new Promise<void>((resolve) => setTimeout(resolve, delay));
			if (versionRef.current !== version) throw new Error("Selection changed");
			const { items } = await actions.readDevices();
			const ready = items
				.find((item) => item.id === deviceId)
				?.modelEndpoints?.some(
					(item) =>
						item.endpointId === target?.endpointId && item.revision === revision && item.protocol === deviceProtocol,
				);
			if (ready) return target;
		}
		throw new Error("Device endpoint not ready");
	}

	return { endpoint, addEndpoint, resolveTarget, reset };
}

/** What a discovery pass reports back: the ids, and whatever metadata the endpoint volunteered. */
export interface DiscoveryResult {
	models: string[];
	metadata: Record<string, ProviderModelMetadata>;
}
