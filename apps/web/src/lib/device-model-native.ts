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

export function useDeviceModelEndpointRegistration() {
	const context = useLocalFilesContext();
	if (!context || !localFilesSupported()) return undefined;
	return async ({ deviceId, baseUrl, label }: { deviceId: string; baseUrl: string; label?: string }) => {
		if (deviceId !== context.deviceId) throw new Error("endpoint_unavailable");
		// The bridge activates only from the application session, never from an incoming command.
		const endpoint = await invokeDeviceModel<DeviceModelEndpoint>("register", {
			context,
			id: crypto.randomUUID(),
			baseUrl,
			label: label || "Local models",
		});
		for (const listener of changed) listener();
		return endpoint;
	};
}
