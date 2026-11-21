import { locate, MAIN_CONVERSATION } from "@yonder/ui-shell";
import type { usePageNavigation } from "./use-page-navigation.ts";

export const MAIN_BOT_PATH = `/messages/${MAIN_CONVERSATION}`;

const pathname = (path: string | null) => path?.split(/[?#]/)[0] ?? null;

function isTabLevel(path: string) {
	const located = locate(path);
	return path === MAIN_BOT_PATH || Boolean(located?.tab && !located.detail.length);
}

/** Tapping the tab already open: a list goes back to its top, the main Bot to its latest message. */
function scrollHome(chat: boolean) {
	const scroller = document.querySelector<HTMLElement>(
		chat ? "main [data-frame-scroll], main .overflow-y-auto" : "aside [data-frame-scroll]",
	);
	scroller?.scrollTo({ top: chat ? scroller.scrollHeight : 0, behavior: "smooth" });
}

/**
 * On a phone the main Bot is the first tab, so moving between it and the other tab roots is a
 * tab switch, not a push. The main Bot stays beneath the other tabs in history: Android Back and
 * the browser's Back from any other tab root land on it, and Back on it leaves the app.
 * Everything below a tab root still opens as a pushed page; the computer opens every destination
 * as before.
 */
export function usePhoneTabs(navigation: ReturnType<typeof usePageNavigation>, phone: boolean, onMainBot: boolean) {
	return {
		go(target: string) {
			if (!phone || !isTabLevel(pathname(target) ?? target)) return navigation.open(target);
			const destination = pathname(target) ?? target;
			if (destination === navigation.current()) return scrollHome(onMainBot);
			// A tab root already beneath this page (the main Bot, or this tab's own root under one
			// of its pages) is returned to, so tapping a tab never stacks a second copy of it.
			if (destination === MAIN_BOT_PATH || navigation.visited(destination)) return navigation.back(target);
			if (onMainBot) return navigation.open(target);
			return navigation.replace(target);
		},
		/** Leaving a page opened from the main Bot returns to it rather than to that page's own tab. */
		backToMainBot() {
			const previous = navigation.previous();
			if (!phone || !previous || pathname(previous) !== MAIN_BOT_PATH) return false;
			navigation.back(previous);
			return true;
		},
	};
}
