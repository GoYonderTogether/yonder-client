import type { DeviceModelProtocol } from "@yonder/protocol";
import { localFilesSupported, useLocalFilesContext } from "./local-files.ts";

/** What the shell keeps locally: an approved address, its protocol and, optionally, its key. */
export interface DeviceModelEndpoint {
	endpointId: string;
	revision: number;
	label: string;
	/** The shell always names the protocol; an older shell may omit it, and then it is OpenAI. */
	protocol: DeviceModelProtocol;
}

const changed = new Set<() => void>();

export function onDeviceModelEndpointsChanged(listener: () => void) {
	changed.add(listener);
	return () => void changed.delete(listener);
}

export async function invokeDeviceModel<T>(name: string, args: Record<string, unknown>): Promise<T> {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<T>(`device_model_${name}`, args);
}

type EndpointRegistration =
	| { deviceId: string; baseUrl: string; label?: string; protocol?: DeviceModelProtocol; apiKey?: string }
	| { deviceId: string; endpointId: string; protocol?: DeviceModelProtocol; apiKey: string };

export function useDeviceModelEndpointRegistration() {
	const context = useLocalFilesContext();
	if (!context || !localFilesSupported()) return undefined;
	return async (input: EndpointRegistration) => {
		if (input.deviceId !== context.deviceId) throw new Error("endpoint_unavailable");
		// The bridge activates only from the application session, never from an incoming command.
		const endpoint =
			"endpointId" in input
				? await invokeDeviceModel<DeviceModelEndpoint>("set_key", {
						context,
						endpointId: input.endpointId,
						apiKey: input.apiKey,
					})
				: await invokeDeviceModel<DeviceModelEndpoint>("register", {
						context,
						id: crypto.randomUUID(),
						baseUrl: input.baseUrl,
						label: input.label || "Local models",
						protocol: input.protocol ?? "openai",
						...(input.apiKey ? { apiKey: input.apiKey } : {}),
					});
		for (const listener of changed) listener();
		return endpoint;
	};
}
