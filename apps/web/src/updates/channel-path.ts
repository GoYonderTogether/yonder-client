export const BETA_PATH = "/beta";
export const BETA_SETUP_PARAM = "beta-setup";

export function browserBeta(pathname: string): boolean {
	return pathname === BETA_PATH || pathname.startsWith(`${BETA_PATH}/`);
}

export function releasePath(channel: "stable" | "beta", location: Pick<Location, "pathname" | "search" | "hash">) {
	const source = browserBeta(location.pathname) ? location.pathname.slice(BETA_PATH.length) : location.pathname;
	const pathname = `/${source.replace(/^[\\/]+/, "")}`;
	const params = new URLSearchParams(location.search);
	params.delete(BETA_SETUP_PARAM);
	const search = params.toString();
	return `${channel === "beta" ? BETA_PATH : ""}${pathname}${search ? `?${search}` : ""}${location.hash}`;
}
