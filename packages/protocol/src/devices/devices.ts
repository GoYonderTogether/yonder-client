import type { DeviceInfo } from "../auth/auth.ts";
import type { DeviceModelEndpoint } from "../models/device-provider.ts";

export interface DeviceSummary {
	id: string;
	name: string;
	remark?: string | null;
	platform: DeviceInfo["platform"];
	appVersion: string;
	status: "online" | "offline";
	lastSeenAt: string;
	current: boolean;
	modelEndpoints?: DeviceModelEndpoint[];
}

export interface DeviceListResponse {
	items: DeviceSummary[];
}

export interface UpdateDeviceRemarkRequest {
	remark: string | null;
}
