import { BOT_VISITS, BOT_VISITS_PATH, locate, type TabId, tabPath } from "@yonder/ui-shell";
import { useCallback, useRef } from "react";
import { memoryDetailParent } from "../pages/memory/memory-view.ts";
import { settingsPagePaths } from "./settings-navigation.ts";
import type { usePageNavigation } from "./use-page-navigation.ts";
import type { usePhoneTabs } from "./use-phone-tabs.ts";

/** Back, Escape and swipe all read the current route, including from a departing layer. */
export function useFrameBack({
	navigation,
	tabs,
	tab,
	tabLocation,
	splitMe,
	search,
}: {
	navigation: ReturnType<typeof usePageNavigation>;
	tabs: ReturnType<typeof usePhoneTabs>;
	tab: TabId;
	tabLocation: string;
	splitMe: boolean;
	search: string;
}) {
	const back = () => {
		const live = locate(navigation.current());
		const liveMeOpen = live !== null && live.tab === null;
		if (live?.tab === "messages" && live.detail[0] === BOT_VISITS && live.detail[1])
			return navigation.back(BOT_VISITS_PATH);
		if (!liveMeOpen && tabs.backToMainBot()) return;
		if (live?.tab === "memory") return navigation.back(memoryDetailParent(live.detail));
		if (!liveMeOpen) return navigation.back(tabPath(live?.tab ?? tab));
		const state = navigation.currentState();
		const parent = settingsPagePaths(live.detail, state?.channelOriginBotId).at(-2);
		if (parent === "/me/channels")
			return navigation.back(state?.channelParentPath ?? `${parent}${search}`, state ?? undefined);
		if (parent?.startsWith("/me/channels/")) return navigation.back(`${parent}${search}`, state ?? undefined);
		if (parent) return navigation.back(parent);
		if (live.detail.length && !splitMe) return navigation.back("/me");
		return navigation.back(tabLocation);
	};
	const backRef = useRef(back);
	backRef.current = back;
	return useCallback(() => backRef.current(), []);
}
