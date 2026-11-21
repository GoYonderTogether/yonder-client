import type { MessageChannel } from "@yonder/feature-me";

function settingsPath(detail: readonly string[]) {
	return `/me/${detail.map(encodeURIComponent).join("/")}`;
}

export function botSettingsPath(botId: string) {
	return settingsPath(["bots", botId]);
}

export function channelsSettingsPath(botId: string, page?: MessageChannel | "external") {
	const detail = page === "external" ? ["channels", "feishu", "external"] : page ? ["channels", page] : ["channels"];
	return `${settingsPath(detail)}?bot=${encodeURIComponent(botId)}`;
}

export function receptionSettingsPath(...detail: string[]) {
	return settingsPath(["reception", ...detail]);
}

/** Alternating folder/ID segments keep every ancestor available on a direct link. */
export function receptionFolderRoute(detail: readonly string[]) {
	const folderIds: string[] = [];
	let index = 0;
	while (detail[index] === "folder") {
		const id = detail[index + 1];
		if (!id) break;
		folderIds.push(id);
		index += 2;
	}
	return { folderIds, leaf: detail[index], valid: folderIds.length > 0 && detail.length - index <= 1 };
}

/** Keep the parent pages mounted under their child, including a Bot's shortcut to Channels. */
export function settingsPagePaths(detail: readonly string[], channelOriginBotId?: string) {
	const section = detail[0];
	if (section === "reception" && detail[1] === "folder" && detail[2]) {
		const { folderIds, leaf, valid } = receptionFolderRoute(detail.slice(1));
		if (!valid) return [receptionSettingsPath(), settingsPath(detail)];
		const pages = [receptionSettingsPath()];
		for (let depth = 1; depth <= folderIds.length; depth++) pages.push(settingsPath(detail.slice(0, 1 + depth * 2)));
		if (leaf) pages.push(settingsPath(detail));
		// Back still derives the parent from the full URL without mounting an entire deep hierarchy.
		return pages.slice(-3);
	}
	if (section === "reception" && (detail[1] === "document" || detail[1] === "find") && detail[2])
		return [receptionSettingsPath(), settingsPath(detail)];
	const depth = section === "bots" ? 3 : 2;
	const pages = detail.slice(0, depth).map((_, index) => settingsPath(detail.slice(0, index + 1)));
	if (detail.length > depth && (section === "bots" || section === "reception" || section === "channels")) {
		pages.push(settingsPath(detail));
	}
	if (section === "channels" && detail[1] === "external") pages.splice(1, 0, settingsPath(["channels", "feishu"]));
	return section === "channels" && channelOriginBotId
		? ["/me/bots", botSettingsPath(channelOriginBotId), ...pages]
		: pages;
}
