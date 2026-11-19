import type { DeviceInfo } from "../auth/auth.ts";

export interface DeviceSummary {
	id: string;
	name: string;
	remark?: string | null;
	platform: DeviceInfo["platform"];
	appVersion: string;
	status: "online" | "offline";
	lastSeenAt: string;
	current: boolean;
}

export interface DeviceListResponse {
	items: DeviceSummary[];
}

export interface UpdateDeviceRemarkRequest {
	remark: string | null;
}
