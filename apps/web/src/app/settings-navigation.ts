function settingsPath(detail: readonly string[]) {
	return `/me/${detail.map(encodeURIComponent).join("/")}`;
}

export function botSettingsPath(botId: string) {
	return settingsPath(["bots", botId]);
}

export function channelsSettingsPath(botId: string, page?: "external") {
	return `/me/channels${page ? `/${page}` : ""}?bot=${encodeURIComponent(botId)}`;
}

/** Keep the parent pages mounted under their child, including a Bot's shortcut to Channels. */
export function settingsPagePaths(detail: readonly string[], channelOriginBotId?: string) {
	const section = detail[0];
	const depth = section === "bots" ? 3 : 2;
	const pages = detail.slice(0, depth).map((_, index) => settingsPath(detail.slice(0, index + 1)));
	if (detail.length > depth && (section === "bots" || section === "reception" || section === "channels")) {
		pages.push(settingsPath(detail));
	}
	return section === "channels" && channelOriginBotId
		? ["/me/bots", botSettingsPath(channelOriginBotId), ...pages]
		: pages;
}
