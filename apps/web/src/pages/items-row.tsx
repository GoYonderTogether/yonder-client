import type { ItemSummary } from "@yonder/protocol";
import { ListRow, type RowAction } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";
import { itemFailure, itemSummaryLine, itemTimeLabel, itemTrailingKey } from "./items-format.ts";

/** The state word, coloured by what it means: a wait is the accent, a pause is quiet. */
function stateClass(item: ItemSummary): string {
	const base = "shrink-0 text-caption";
	if (item.state === "waiting_user") return `${base} text-[var(--color-accent-text)]`;
	if (item.state === "paused") return `${base} text-[var(--color-text-tertiary)]`;
	return `${base} text-[var(--color-text-secondary)]`;
}

/**
 * One row: the title, the one status word the owner acts on, the Bot that owns it and one line of
 * outcome. A failure's line is the real reason, translated from the server's code; nothing is
 * invented for a row with no result (2026-11-24: no 已完成 / 已取消 word, as in Meta Muse).
 */
export function ItemRow({
	item,
	botName,
	onOpen,
	locale,
	actions,
}: {
	item: ItemSummary;
	botName: string | null;
	onOpen: () => void;
	locale: string;
	actions: readonly RowAction[];
}) {
	const { t } = useTranslation();
	const line = itemSummaryLine(item);
	const fallback =
		item.source === "visit"
			? t(item.state === "completed" ? "visits.relayApproved" : "visits.relayOpen")
			: item.source === "conversation"
				? null
				: t("tasks.itemNoResult");
	const outcome =
		line.kind === "failure"
			? itemFailure(line.text, locale).text
			: line.kind === "result"
				? line.text
				: (item.waitingReason ?? fallback);
	const meta = [
		item.source === "meeting" ? t("meetingRecorder.name") : null,
		botName,
		itemTimeLabel(item.startedAt, locale),
	]
		.filter(Boolean)
		.join(" · ");
	const word = itemTrailingKey(item);
	return (
		<ListRow
			actions={actions}
			chevron
			onClick={onOpen}
			title={item.title}
			subtitle={
				<span className="flex flex-col gap-[var(--spacing-1)]">
					{outcome ? <span className="truncate">{outcome}</span> : null}
					{meta ? <span className="text-[var(--color-text-tertiary)]">{meta}</span> : null}
				</span>
			}
			trailing={word ? <span className={stateClass(item)}>{t(word)}</span> : undefined}
		/>
	);
}
