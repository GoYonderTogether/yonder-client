async function invokeDownload(action: "open" | "share" | "copy", url: string): Promise<void> {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke(`plugin:yonder-device-download|${action}`, { url });
}

export const openDeviceDownload = (url: string) => invokeDownload("open", url);
export const shareDeviceDownload = (url: string) => invokeDownload("share", url);
export const copyDeviceDownload = (url: string) => invokeDownload("copy", url);
