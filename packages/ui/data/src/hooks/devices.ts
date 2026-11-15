import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DeviceInfo } from "@yonder/protocol";
import { useSessionStore } from "../auth/session-store.ts";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

/** Bind restored sessions to this installation too, without requiring another sign-in. */
export function useDeviceRegistration(device: (DeviceInfo & { installationId: string }) | null) {
	const api = useApi();
	const queryClient = useQueryClient();
	const status = useSessionStore((state) => state.status);
	return useQuery({
		queryKey: keys.deviceRegistration(device?.installationId ?? ""),
		queryFn: async () => {
			if (!device) return null;
			const result = await api.registerDevice(device);
			void queryClient.invalidateQueries({ queryKey: keys.devices() });
			void queryClient.invalidateQueries({ queryKey: keys.sessions() });
			return result;
		},
		enabled: status === "signed-in" && device !== null,
		staleTime: 0,
	});
}

export function useDevices(options: { enabled?: boolean } = {}) {
	const api = useApi();
	return useQuery({
		queryKey: keys.devices(),
		queryFn: () => api.devices(),
		staleTime: 30_000,
		enabled: options.enabled ?? true,
	});
}
