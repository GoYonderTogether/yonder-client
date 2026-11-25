import type { ItemSummary } from "@yonder/protocol";
import { ListRow, type RowAction } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";
import {
	isPlaceholderTitle,
	itemElapsed,
	itemFailure,
	itemPause,
	itemSourceKey,
	itemStateKind,
	itemTimeLabel,
	itemWaitingText,
} from "./items-format.ts";
import { ItemStatusIcon } from "./items-status.tsx";

/**
 * One row: a state mark, the title, and one caption line that says how the line came to be, which Bot
 * owns it and when (2026-11-26). No result line: the list answers "what is running and what waits for
 * me", and the outcome is one tap away in the detail — the founder's 减法, with the one exception of
 * the facts that change what the owner does next.
 *
 * The caption's last slot holds the time for a finished or running item, and is given up to the thing
 * the owner may need to know instead: why a failed run failed, why a pause stopped, what a wait is
 * about. Always as words, never a code. Source and Bot stay because the owner cannot judge a row that
 * does not say where it came from.
 */
export function ItemRow({
	item,
	botName,
	onOpen,
	locale,
	zone,
	now,
	actions,
}: {
	item: ItemSummary;
	botName: string | null;
	onOpen: () => void;
	locale: string;
	/** The account's zone: the row's clock is read in it on every device. */
	zone: string;
	/** The list's clock, refreshed once a minute, so an elapsed time never goes stale. */
	now: Date;
	actions: readonly RowAction[];
}) {
	const { t } = useTranslation();
	const kind = itemStateKind(item);
	const placeholder = isPlaceholderTitle(item.title);
	const source = t(itemSourceKey(item.source));
	const clockAt = item.endedAt ?? item.startedAt;
	const clock = itemTimeLabel(clockAt, locale, zone);

	const detail =
		kind === "failed" && item.failureReason
			? itemFailure(item.failureReason, locale).text
			: kind === "paused"
				? itemPause(item.failureReason, locale)
				: kind === "waiting"
					? itemWaitingText(item, item.title, locale)
					: kind === "running"
						? t("tasks.itemRunningFor", { duration: itemElapsed(item.startedAt, now, locale) })
						: null;
	const time = detail ? null : placeholder ? t("tasks.itemEndedClock", { time: clock }) : clock;
	return (
		<ListRow
			actions={actions}
			chevron
			onClick={onOpen}
			leading={<ItemStatusIcon item={item} />}
			title={item.title}
			subtitle={
				<RowCaption
					source={source}
					botName={botName}
					detail={detail}
					time={time}
					clockAt={clockAt}
					brightClock={placeholder}
				/>
			}
			className={kind === "waiting" ? "bg-[var(--color-accent-subtle)]" : undefined}
		/>
	);
}

/**
 * The caption: how it came to be, which Bot, and when — then the one fact that replaces the time
 * when there is one. The source word and that last fact never truncate: 「Bot 派的任…」 would hide
 * where the row came from, and a reason cut to its first characters is worse than none. The Bot name
 * is the part that gives way, so a long account or Bot name never eats what the row is saying.
 */
function RowCaption({
	source,
	botName,
	detail,
	time,
	clockAt,
	brightClock,
}: {
	source: string;
	botName: string | null;
	detail: string | null;
	time: string | null;
	clockAt: string;
	brightClock: boolean;
}) {
	return (
		<span className="flex min-w-0 items-center gap-[var(--spacing-1)]">
			<span className="shrink-0">{source}</span>
			{botName ? (
				<>
					<span aria-hidden="true" className="shrink-0">
						·
					</span>
					<span className="min-w-0 max-w-[40%] shrink truncate">{botName}</span>
				</>
			) : null}
			{detail ? (
				<>
					<span aria-hidden="true" className="shrink-0">
						·
					</span>
					<span className="min-w-0 flex-1 truncate">{detail}</span>
				</>
			) : null}
			{time ? (
				<>
					<span aria-hidden="true" className="shrink-0">
						·
					</span>
					<time
						dateTime={clockAt}
						className={
							brightClock
								? "shrink-0 font-medium text-[var(--color-text-secondary)]"
								: "shrink-0 text-[var(--color-text-tertiary)]"
						}
					>
						{time}
					</time>
				</>
			) : null}
		</span>
	);
}
