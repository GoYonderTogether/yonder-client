import type { DeviceSummary } from "@yonder/protocol";

export function deviceDisplayName(device: DeviceSummary): string {
	return device.remark?.trim() || device.name;
}
