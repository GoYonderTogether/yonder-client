import type { MemoryRef, MemoryRefType, MemoryRow } from "@yonder/protocol";
import { cn } from "@yonder/ui-components";
import type { LucideIcon } from "lucide-react";
import { Activity, CalendarDays, FileText, Globe, Images, MapPin, MessageSquare, Mic } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMemoryFormat } from "./memory-format.ts";

export const REF_ICONS: Record<MemoryRefType, LucideIcon> = {
	file: FileText,
	place: MapPin,
	web: Globe,
	chat: MessageSquare,
	recording: Mic,
	photo: Images,
	calendar: CalendarDays,
	device: Activity,
};

export type RefLookup = Map<string, MemoryRef>;
export type EntryRow = Exclude<MemoryRow, { type: "move" }>;

export const rowAt = (row: MemoryRow) => (row.type === "event" ? row.at : row.startsAt);
export const rowTime = (row: MemoryRow) => Date.parse(rowAt(row));
export const rowSources = (row: EntryRow) => (row.type === "place" ? [row.ref] : row.refs);

/** What an entry says: one sentence, and at most one quiet line under it. */
export function useEntryText() {
	const { t, i18n } = useTranslation();
	const format = useMemoryFormat();
	return (row: EntryRow, refs: RefLookup) => {
		if (row.type === "place") {
			const stay = row.endsAt
				? t("memory.stayUntil", { time: format.time(row.endsAt, i18n.language) })
				: t("memory.stillHere");
			return {
				title: refs.get(row.ref)?.label ?? "",
				note: row.note ? t("memory.joinNote", { first: stay, second: row.note }) : stay,
			};
		}
		const quote = row.weight === "key" ? row.refs.map((id) => refs.get(id)?.quote).find(Boolean) : null;
		return { title: row.title, note: quote ?? row.detail };
	};
}

/** One row: time on the left, the sentence on the right. Tapping it opens where it came from. */
export function MemoryEntry({
	row,
	refs,
	upcoming,
	onOpen,
}: {
	row: EntryRow;
	refs: RefLookup;
	upcoming: boolean;
	onOpen: (row: EntryRow) => void;
}) {
	const { i18n } = useTranslation();
	const format = useMemoryFormat();
	const text = useEntryText()(row, refs);
	const tone = row.type === "place" ? "place" : row.weight;
	return (
		<li
			id={`memory-row-${row.id}`}
			className={cn("memory-entry", `memory-entry-${tone}`, upcoming && "memory-entry-upcoming")}
		>
			<button type="button" aria-haspopup="dialog" onClick={() => onOpen(row)}>
				<time dateTime={rowAt(row)}>{format.time(rowAt(row), i18n.language)}</time>
				<span className="memory-entry-text">
					<span className="memory-entry-title">
						{row.type === "place" ? <MapPin size={13} aria-hidden /> : null}
						{text.title}
					</span>
					{text.note ? <span className="memory-entry-note">{text.note}</span> : null}
				</span>
			</button>
		</li>
	);
}
