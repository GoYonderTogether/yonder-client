import { ChevronRight } from "lucide-react";

/**
 * What the present has to show above the composer. Any page may supply these (the timeline, the task
 * and list pages); the strip does not care where they come from, and it never owns an input: the
 * composer under it is the one the main Bot chat uses.
 */
export interface NowItem {
	id: string;
	/** A running task is a status. A waiting item is a thing on the owner. */
	kind: "running" | "waiting";
	title: string;
	/** Only a waiting item can be pressed: it prefills the main Bot's draft and sends nothing. */
	onPress?: () => void;
}

/** Three cards at most; a fourth would push the composer off a phone screen. */
export const NOW_LIMIT = 3;

export function NowStrip({ items }: { items: readonly NowItem[] }) {
	const shown = items.slice(0, NOW_LIMIT);
	if (!shown.length) return null;
	return (
		<ul className="pointer-events-auto mb-[var(--spacing-2)] flex gap-[var(--spacing-2)] overflow-x-auto">
			{shown.map((item) => (
				<li key={item.id} className="shrink-0">
					{item.kind === "waiting" && item.onPress ? (
						<button
							type="button"
							onClick={item.onPress}
							className="flex max-w-[16rem] items-center gap-[var(--spacing-2)] rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-left text-caption text-[var(--color-text-primary)]"
						>
							<span className="line-clamp-2">{item.title}</span>
							<ChevronRight className="shrink-0 text-[var(--color-accent-text)]" size={14} aria-hidden />
						</button>
					) : (
						<span className="flex max-w-[16rem] items-center gap-[var(--spacing-2)] rounded-[var(--radius-control)] bg-[var(--color-accent-subtle)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-caption text-[var(--color-accent-text)]">
							<span
								aria-hidden
								className="size-2 shrink-0 rounded-full bg-[var(--color-accent)] motion-safe:animate-pulse"
							/>
							<span className="line-clamp-2">{item.title}</span>
						</span>
					)}
				</li>
			))}
		</ul>
	);
}
