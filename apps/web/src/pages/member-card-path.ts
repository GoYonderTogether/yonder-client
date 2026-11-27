/**
 * Where a card lives in the URL: `/@对外号` (17 3.7, 19 4.2). React Router 8 has no way to put a
 * literal `@` in a path segment — `/@:handle` does not match anything, and a bare `*` guard would
 * swallow every path — so the path is read here and the router asks before rendering anything else.
 */
const CARD_PREFIX = "@";

/**
 * The handle in the URL, or null when the path is not a card. One segment only: `/@abc` and
 * `/@abc/` are a card, `/@` alone and `/@abc/def` are not.
 */
export function memberHandle(pathname: string): string | null {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length !== 1) return null;
	const [first] = segments;
	if (!first?.startsWith(CARD_PREFIX)) return null;
	const handle = first.slice(CARD_PREFIX.length);
	if (!handle) return null;
	try {
		return decodeURIComponent(handle);
	} catch {
		return null;
	}
}

export function isMemberCardPath(pathname: string): boolean {
	return memberHandle(pathname) !== null;
}
