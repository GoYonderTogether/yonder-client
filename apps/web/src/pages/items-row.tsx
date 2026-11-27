import type { ItemSummary } from "@yonder/protocol";
import { ListRow, type RowAction } from "@yonder/ui-components";
import { useItemPendingReply } from "@yonder/ui-data";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
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
 * One row: the title, the Bot that owns it, and the status or elapsed time.
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
	const reply = useItemPendingReply(item);
	const startedAt = reply?.createdAt ?? (item.state === "running" ? item.startedAt : null);
	return (
		<ListRow
			actions={actions}
			onClick={onOpen}
			title={item.title}
			subtitle={meta ? <span className="text-[var(--color-text-tertiary)]">{meta}</span> : undefined}
			trailing={
				startedAt ? (
					<ItemRuntime startedAt={startedAt} />
				) : word ? (
					<span className={stateClass(item)}>{t(word)}</span>
				) : undefined
			}
		/>
	);
}

function ItemRuntime({ startedAt }: { startedAt: string }) {
	const { t } = useTranslation();
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, []);
	const elapsed = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
	return (
		<span className="inline-flex max-w-full items-center gap-[var(--spacing-1)] text-caption text-[var(--color-text-tertiary)] opacity-[var(--opacity-disabled)] tabular-nums">
			<LoaderCircle aria-hidden="true" className="size-[var(--text-micro)] shrink-0 motion-safe:animate-spin" />
			<span className="truncate">
				{Number.isFinite(elapsed)
					? t("tasks.itemRuntime", {
							minutes: Math.floor(elapsed / 60),
							seconds: String(elapsed % 60).padStart(2, "0"),
						})
					: t("tasks.itemStateRunning")}
			</span>
		</span>
	);
}
