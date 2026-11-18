import type { MemoryFileLimit, MemoryFileSummary } from "@yonder/protocol";
import { useBot } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";

/**
 * Who last wrote a file, as the owner says it (24 第四节): the Bot's name, 你, or 系统. A checkpoint
 * or a summary is the main Bot's own background run, so it carries the main Bot's name.
 */
export function useAuthorName() {
	const { t } = useTranslation();
	const bot = useBot();
	return (file: Pick<MemoryFileSummary, "updatedBy" | "updatedByName">): string => {
		const [kind] = file.updatedBy.split(":");
		if (kind === "user") return t("memory.byYou");
		if (kind === "bot") return file.updatedByName || bot?.displayName || t("memory.byBot");
		if (kind === "checkpoint" || kind === "digest") return bot?.displayName || t("memory.byBot");
		return t("memory.bySystem");
	};
}

/** 「刚刚」「5 分钟前」「3 天前」; a date once it is more than a week old. */
export function relativeTime(iso: string, now: Date, locale: string, justNow: string): string {
	const seconds = Math.round((Date.parse(iso) - now.getTime()) / 1000);
	if (Math.abs(seconds) < 60) return justNow;
	const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	const minutes = Math.round(seconds / 60);
	if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
	const hours = Math.round(minutes / 60);
	if (Math.abs(hours) < 24) return format.format(hours, "hour");
	const days = Math.round(hours / 24);
	if (Math.abs(days) < 7) return format.format(days, "day");
	return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(iso));
}

/** Measured the way the server measures it (23 7.5): code points for the `/me` files, UTF-8 bytes else. */
export function measure(text: string, limit: MemoryFileLimit): number {
	return limit.unit === "characters" ? [...text].length : new TextEncoder().encode(text).length;
}
