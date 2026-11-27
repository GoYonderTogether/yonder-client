import Taro from "@tarojs/taro";
import type { DeviceFileReference } from "@yonder/chat-model";

let pending: DeviceFileReference | undefined;

/** Pass the path in memory rather than exposing a local filename in an H5 route or share URL. */
export function openDeviceFile(reference: DeviceFileReference) {
	if (pending) return;
	pending = reference;
	void Taro.navigateTo({ url: "/pages/device-file/index" }).catch(() => {
		pending = undefined;
	});
}

export function takeDeviceFile(): DeviceFileReference | undefined {
	const reference = pending;
	pending = undefined;
	return reference;
}
