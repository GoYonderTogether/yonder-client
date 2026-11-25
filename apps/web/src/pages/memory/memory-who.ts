import type { MemoryFileLimit, MemoryFileSummary } from "@yonder/protocol";
import { useBot, useContacts } from "@yonder/ui-data";
import { formatInstant } from "@yonder/ui-time";
import { useTranslation } from "react-i18next";

export type MemoryAuthor = Pick<MemoryFileSummary, "updatedBy" | "updatedByName"> & { path?: string };

/**
 * Who wrote a file, by name and never by an internal word (23 §18, 24 第四节): a Bot by its own
 * name, a checkpoint or a summary by the main Bot's name (they are its background runs), a
 * connector's archive by the connector's name, the owner as 你, onboarding as 系统. The server sends
 * the name; a revision carries only the raw author, so the client resolves it from contacts, the
 * main Bot, or the archive's folder, and says "Bot" only when no name can be found.
 */
export function useAuthorName() {
	const { t } = useTranslation();
	const bot = useBot();
	const contacts = useContacts();
	return ({ updatedBy, updatedByName, path }: MemoryAuthor): string => {
		const [kind, id] = updatedBy.split(":");
		if (kind === "user") return t("memory.byYou");
		if (kind === "bot")
			return updatedByName || contacts.data?.items.find((member) => member.id === id)?.displayName || t("memory.byBot");
		if (kind === "checkpoint" || kind === "digest") return updatedByName || bot?.displayName || t("memory.byBot");
		if (kind === "router") return updatedByName || path?.match(/^\/sources\/([^/]+)\//u)?.[1] || t("memory.bySystem");
		return t("memory.bySystem");
	};
}

/**
 * 「刚刚」「5 分钟前」「3 天前」; a date once it is more than a week old. Elapsed counts need no zone;
 * the date past a week is read on the account's calendar, so both devices agree which day it was.
 */
export function relativeTime(iso: string, now: Date, locale: string, justNow: string, zone: string): string {
	const seconds = Math.round((Date.parse(iso) - now.getTime()) / 1000);
	if (Math.abs(seconds) < 60) return justNow;
	const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	const minutes = Math.round(seconds / 60);
	if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
	const hours = Math.round(minutes / 60);
	if (Math.abs(hours) < 24) return format.format(hours, "hour");
	const days = Math.round(hours / 24);
	if (Math.abs(days) < 7) return format.format(days, "day");
	return formatInstant(iso, { zone, locale, style: "monthDay", width: "short" });
}

/** Measured the way the server measures it (23 7.5): code points for the `/me` files, UTF-8 bytes else. */
export function measure(text: string, limit: MemoryFileLimit): number {
	return limit.unit === "characters" ? [...text].length : new TextEncoder().encode(text).length;
}
