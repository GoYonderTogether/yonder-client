import { apiBaseUrl } from "./config.ts";
import { isTauri } from "./keychain.ts";

/** The origin a shared card points at: the page's own on the web, the production server in a shell. */
export function cardOrigin(): string {
	return apiBaseUrl({ shell: isTauri(), dev: import.meta.env.DEV }) || window.location.origin;
}

/**
 * The one address of a card (19 4.2): `/@对外号` on the Yonder origin, so a phone's camera or WeChat
 * opens it directly. The sharer's invite code rides along as `?i=`, so a stranger who signs up from
 * the card counts as invited by them; Yonder's own scanner reads only the path.
 */
export function cardLink(handle: string, origin: string, inviteCode?: string | null): string {
	const url = new URL(`/@${encodeURIComponent(handle)}`, origin);
	if (inviteCode) url.searchParams.set("i", inviteCode);
	return url.toString();
}

/** A code from `?i=` that is worth asking the server about; the server still decides if it is valid. */
export function cardInviteCode(search: string): string | null {
	const code = new URLSearchParams(search).get("i");
	return code && /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : null;
}
