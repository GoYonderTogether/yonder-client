import type { ItemSummary } from "@yonder/protocol";
import { ListRow, type RowAction } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";
import { itemTrailingKey } from "./items-format.ts";

/** The state word, coloured by what it means: a wait is the accent, a pause is quiet. */
function stateClass(item: ItemSummary): string {
	const base = "shrink-0 text-caption";
	if (item.state === "waiting_user") return `${base} text-[var(--color-accent-text)]`;
	if (item.state === "paused") return `${base} text-[var(--color-text-tertiary)]`;
	return `${base} text-[var(--color-text-secondary)]`;
}

/**
 * One row: the title, the one status word the owner acts on, and the Bot that owns it. The outcome
 * preview and the start time are not shown here (2026-11-27); both live on the item's own page.
 */
export function ItemRow({
	item,
	botName,
	onOpen,
	actions,
}: {
	item: ItemSummary;
	botName: string | null;
	onOpen: () => void;
	actions: readonly RowAction[];
}) {
	const { t } = useTranslation();
	const meta = [item.source === "meeting" ? t("meetingRecorder.name") : null, botName].filter(Boolean).join(" · ");
	const word = itemTrailingKey(item);
	return (
		<ListRow
			actions={actions}
			onClick={onOpen}
			title={item.title}
			subtitle={meta ? <span className="text-[var(--color-text-tertiary)]">{meta}</span> : undefined}
			trailing={word ? <span className={stateClass(item)}>{t(word)}</span> : undefined}
		/>
	);
}
