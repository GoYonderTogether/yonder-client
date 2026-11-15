/**
 * The shells' refresh-token storage.
 *
 * Desktop: the OS credential store, through the Tauri keyring plugin. The webview never writes the
 * token anywhere a script could read after a reload; the plugin's commands are the only path, and
 * the token is read once at start-up.
 *
 * iOS and Android: the keyring plugin has no mobile implementation, so the token is kept in the
 * webview's own storage, which lives inside the app's sandbox. A native Keychain / Keystore plugin
 * would replace this.
 *
 * Imported dynamically, and only when the page detects the Tauri runtime, so the browser build
 * never loads it (05-前端架构和技术栈 第十一节第 5 条).
 */
const SERVICE = "dev.yonder.desktop";
const ACCOUNT = "refresh-token";

export interface KeychainStorage {
	get(): string | null;
	set(value: string | null): void;
	/** Resolves once the token has been read from the keychain; the session boot waits for it. */
	ready: Promise<void>;
}

export async function createKeychainStorage(): Promise<KeychainStorage> {
	if (isMobileShell()) return sandboxStorage();
	const keyring = await import("tauri-plugin-keyring-api");
	let token: string | null = null;

	const ready = keyring
		.getPassword(SERVICE, ACCOUNT)
		.then((value) => {
			token = value;
		})
		.catch(() => {
			// A missing entry, or a denied keychain prompt, means "not signed in" rather than a crash.
			token = null;
		});

	return {
		ready,
		get: () => token,
		set(value) {
			token = value;
			// The write is fire-and-forget from the caller's point of view; a failure means the user
			// signs in again next launch, which is the safe direction to fail in.
			if (value === null) void keyring.deletePassword(SERVICE, ACCOUNT).catch(() => undefined);
			else void keyring.setPassword(SERVICE, ACCOUNT, value).catch(() => undefined);
		},
	};
}

/** True when the page is running inside a Tauri webview. */
export function isTauri(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** True inside the iOS or Android shell, where the keyring plugin is not compiled in. */
function isMobileShell(): boolean {
	return typeof navigator !== "undefined" && /iPhone|iPad|Android/i.test(navigator.userAgent);
}

function sandboxStorage(): KeychainStorage {
	const key = `${SERVICE}.${ACCOUNT}`;
	return {
		ready: Promise.resolve(),
		get: () => localStorage.getItem(key),
		set(value) {
			if (value === null) localStorage.removeItem(key);
			else localStorage.setItem(key, value);
		},
	};
}
