import type { ItemSummary } from "@yonder/protocol";
import { ListRow } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";
import { itemFailureKey, itemStateKey, itemSummaryLine, itemTimeLabel } from "./items-format.ts";

/** The state word, coloured by what it means: a failure is danger, a wait is the accent. */
function stateClass(item: ItemSummary): string {
	const base = "shrink-0 text-caption";
	if (item.state === "failed" || item.state === "cancelled") return `${base} text-[var(--color-danger)]`;
	if (item.state === "waiting_user") return `${base} text-[var(--color-accent-text)]`;
	if (item.state === "paused") return `${base} text-[var(--color-text-tertiary)]`;
	return `${base} text-[var(--color-text-secondary)]`;
}

/**
 * One row: the title, the state, the Bot that owns it and one line of outcome. A failure's line is
 * the real reason, translated from the server's code; nothing is invented for a row with no result.
 */
export function ItemRow({
	item,
	botName,
	onOpen,
	locale,
}: {
	item: ItemSummary;
	botName: string | null;
	onOpen: () => void;
	locale: string;
}) {
	const { t } = useTranslation();
	const line = itemSummaryLine(item);
	const outcome =
		line.kind === "failure"
			? t(itemFailureKey(line.text), { title: item.title })
			: line.kind === "result"
				? line.text
				: t("tasks.itemNoResult");
	const meta = [botName, itemTimeLabel(item.startedAt, locale)].filter(Boolean).join(" · ");
	return (
		<ListRow
			chevron
			onClick={onOpen}
			title={item.title}
			subtitle={
				<span className="flex flex-col gap-[var(--spacing-1)]">
					<span className="truncate">{outcome}</span>
					{meta ? <span className="text-[var(--color-text-tertiary)]">{meta}</span> : null}
				</span>
			}
			trailing={<span className={stateClass(item)}>{t(itemStateKey(item.state))}</span>}
		/>
	);
}
