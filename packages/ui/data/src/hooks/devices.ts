import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SessionSummary } from "@yonder/api-client";
import type { DeviceInfo, DeviceListResponse, UpdateDeviceRemarkRequest } from "@yonder/protocol";
import { useSessionStore } from "../auth/session-store.ts";
import { keys } from "../query/keys.ts";
import { useApi, useData } from "../query/provider.tsx";

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

export function useUpdateDeviceRemark() {
	const api = useApi();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ deviceId, remark }: UpdateDeviceRemarkRequest & { deviceId: string }) =>
			api.updateDeviceRemark(deviceId, { remark }),
		onSuccess: (_result, { deviceId, remark }) => {
			queryClient.setQueryData<DeviceListResponse>(keys.devices(), (devices) =>
				devices
					? { items: devices.items.map((device) => (device.id === deviceId ? { ...device, remark } : device)) }
					: undefined,
			);
			void queryClient.invalidateQueries({ queryKey: keys.devices() });
		},
	});
}

export function useSignOutDevice() {
	const { api, signOutLocal } = useData();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (deviceId: string) => api.signOutDevice(deviceId),
		onSuccess: ({ signedOutCurrent }, deviceId) => {
			if (signedOutCurrent) return signOutLocal();
			queryClient.setQueryData<DeviceListResponse>(keys.devices(), (devices) =>
				devices ? { items: devices.items.filter((device) => device.id !== deviceId) } : undefined,
			);
			queryClient.setQueryData<{ items: SessionSummary[] }>(keys.sessions(), (sessions) =>
				sessions ? { items: sessions.items.filter((session) => session.deviceId !== deviceId) } : undefined,
			);
			void queryClient.invalidateQueries({ queryKey: keys.devices() });
			void queryClient.invalidateQueries({ queryKey: keys.sessions() });
		},
	});
}
