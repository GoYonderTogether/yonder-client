import { localFilesSupported, useLocalFilesContext } from "./local-files.ts";

export interface DeviceModelEndpoint {
	endpointId: string;
	revision: number;
	label: string;
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
	| { deviceId: string; baseUrl: string; label?: string; apiKey?: string }
	| { deviceId: string; endpointId: string; apiKey: string };

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
						...(input.apiKey ? { apiKey: input.apiKey } : {}),
					});
		for (const listener of changed) listener();
		return endpoint;
	};
}
