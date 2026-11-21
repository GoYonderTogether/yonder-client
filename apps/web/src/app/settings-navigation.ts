function settingsPath(detail: readonly string[]) {
	return `/me/${detail.map(encodeURIComponent).join("/")}`;
}

export function botSettingsPath(botId: string) {
	return settingsPath(["bots", botId]);
}

export function channelsSettingsPath(botId: string, page?: "external") {
	return `/me/channels${page ? `/${page}` : ""}?bot=${encodeURIComponent(botId)}`;
}

export function receptionSettingsPath(...detail: string[]) {
	return settingsPath(["reception", ...detail]);
}

/** Keep the parent pages mounted under their child, including a Bot's shortcut to Channels. */
export function settingsPagePaths(detail: readonly string[], channelOriginBotId?: string) {
	const section = detail[0];
	if (section === "reception" && detail[1] === "folder" && detail[2]) {
		const pages = [receptionSettingsPath(), receptionSettingsPath("folder", detail[2])];
		if (detail.length > 3) pages.push(settingsPath(detail));
		return pages;
	}
	if (section === "reception" && detail[1] === "document" && detail[2])
		return [receptionSettingsPath(), settingsPath(detail)];
	const depth = section === "bots" ? 3 : 2;
	const pages = detail.slice(0, depth).map((_, index) => settingsPath(detail.slice(0, index + 1)));
	if (detail.length > depth && (section === "bots" || section === "reception" || section === "channels")) {
		pages.push(settingsPath(detail));
	}
	return section === "channels" && channelOriginBotId
		? ["/me/bots", botSettingsPath(channelOriginBotId), ...pages]
		: pages;
}
