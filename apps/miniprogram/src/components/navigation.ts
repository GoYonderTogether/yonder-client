/** Capsule bounds are absent in some simulator contexts; retain a usable title there. */
export function navigationLayout(
	windowWidth: number,
	statusBarHeight: number,
	capsule: { top: number; height: number; left: number },
) {
	const valid = capsule.height > 0 && capsule.left > 0 && capsule.left < windowWidth && capsule.top >= statusBarHeight;
	const barHeight = valid ? (capsule.top - statusBarHeight) * 2 + capsule.height : 44;
	return {
		barHeight,
		headerHeight: statusBarHeight + barHeight,
		rightInset: valid ? windowWidth - capsule.left + 8 : 96,
	};
}

/** Taro H5 adds a private stamp to route.path; it is never part of a sign-in destination. */
export function pageDestination(routePath: string, params: Record<string, unknown> = {}): string {
	const path = routePath.split("?")[0].replace(/^\//, "");
	const query = Object.entries(params)
		.filter(([key]) => key !== "stamp")
		.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
		.join("&");
	return `/${path}${query ? `?${query}` : ""}`;
}
