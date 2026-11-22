import { isTauri } from "./keychain.ts";

export function prepareIosChatMicrophone(): Promise<void> | undefined {
	if (!isTauri() || !/\biP(?:hone|ad)\b/i.test(navigator.userAgent)) return;
	return import("@tauri-apps/api/core")
		.then(({ invoke }) => invoke<void>("prepare_chat_microphone"))
		.catch(() => {
			// An older shell can still obtain permission when the WebView starts capture.
		});
}
