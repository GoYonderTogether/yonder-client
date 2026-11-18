import type { PrivacySettings } from "@yonder/protocol";

export type PrivacyKey = keyof PrivacySettings;
export const privacyKeys: PrivacyKey[] = ["searchable", "cardForUsers", "cardPublicLink"];

/** All three start on; a card is meant to be found and shared (19 第四节 4.1). */
export const PRIVACY_DEFAULTS: PrivacySettings = { searchable: true, cardForUsers: true, cardPublicLink: true };

/** The value on screen: a pending edit wins over the last value the server confirmed. */
export function shown(state: Partial<PrivacySettings>, saved: PrivacySettings | undefined, key: PrivacyKey): boolean {
	return state[key] ?? saved?.[key] ?? PRIVACY_DEFAULTS[key];
}

/** A switch is flipped at once; a failure puts that one switch back where it was. */
export function optimistic(state: Partial<PrivacySettings>, key: PrivacyKey, next: boolean): Partial<PrivacySettings> {
	return { ...state, [key]: next };
}

export function reverted(
	state: Partial<PrivacySettings>,
	key: PrivacyKey,
	previous: boolean,
): Partial<PrivacySettings> {
	return { ...state, [key]: previous };
}

/** The server answers the whole record; every confirmed switch replaces what is on screen. */
export function confirmed(state: Partial<PrivacySettings>, saved: PrivacySettings): Partial<PrivacySettings> {
	return { ...state, ...saved };
}
