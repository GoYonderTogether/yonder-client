/**
 * The one change signal for every device preference. Appearance, interface size, language and the
 * account's zone are stored under separate keys but read by screens all over the app, so a write to
 * any of them has to wake every reader — one subscription set and one version counter, used by both
 * preference modules.
 */
import { useSyncExternalStore } from "react";

export type Listener = () => void;

const listeners = new Set<Listener>();
let version = 0;

export function subscribePreference(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function notifyPreferences(): void {
	version += 1;
	for (const listener of listeners) listener();
}

/**
 * A number that changes whenever any preference is written. A derived value (an object built from
 * several keys) is memoised on it, because `useSyncExternalStore` needs a snapshot that is stable
 * between writes and a freshly built object never is.
 */
export function usePreferencesVersion(): number {
	return useSyncExternalStore(
		subscribePreference,
		() => version,
		() => version,
	);
}
