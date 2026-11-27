import { isContactWindow } from "./contact-window.ts";
import { isDesktopExperience, isMacDesktopShell } from "./platform.ts";

export type MacPermission = "microphone" | "notifications";
export type MacPermissionStatus = "granted" | "default" | "denied" | "unknown";
export type MacLoginItemStatus = "enabled" | "disabled" | "approval" | "unavailable";

export function supportsMacPermissions() {
	return isMacDesktopShell() && isDesktopExperience() && !isContactWindow();
}

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<T>(`plugin:yonder-mac-permissions|${name}`, args);
}

export const macPermissionStatus = () => command<{ microphone: MacPermissionStatus }>("permission_status");
export const openMacPermissionSettings = (permission: MacPermission) => command<void>("open_settings", { permission });
export const requestMacMicrophone = () => command<boolean>("request_microphone");
export const macLoginItemStatus = () => command<MacLoginItemStatus>("login_item_status");
export const setMacLoginItem = (enabled: boolean) => command<MacLoginItemStatus>("set_login_item", { enabled });
