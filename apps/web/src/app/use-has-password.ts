import { useMe } from "@yonder/ui-data";

/**
 * Whether the account has a password. `/v1/me` lists the sign-in method but not whether a password
 * is set, so the profile carries it as an explicit field: guessing from the method list would be
 * wrong, and showing "not set" for a set password is worse than asking for it.
 */
export function useHasPassword(): boolean {
	const me = useMe();
	return me.data?.hasPassword ?? false;
}
