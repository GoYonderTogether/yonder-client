import type { ItemSummary } from "@yonder/protocol";
import { Check, CircleHelp, CircleX, Loader, Pause } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type ItemStateKind, itemStateKind } from "./items-format.ts";

/**
 * The one state mark of an item, shared by the list and the detail header (2026-11-26): a turning
 * Loader while it runs, an accent question mark when it needs the owner, a danger cross after a
 * failure, a quiet Pause, a quiet Check once it is over. Shape carries the state before colour does.
 *
 * A row shows the mark alone, so the mark names its state for a screen reader. The detail header
 * writes the state out beside the mark, so it passes `named={false}` and the mark is decorative —
 * otherwise the owner hears 「等你」 twice.
 *
 * The Loader is the app's one spinner rule: `motion-safe:animate-spin` stills it under
 * `prefers-reduced-motion`, where a static ring still reads as "in progress".
 */
export function ItemStatusIcon({
	item,
	size = 16,
	named = true,
}: {
	item: ItemSummary;
	size?: number;
	named?: boolean;
}) {
	const { t } = useTranslation();
	const kind = itemStateKind(item);
	const className = `shrink-0 ${
		kind === "running" || kind === "waiting"
			? "text-[var(--color-accent)]"
			: kind === "failed"
				? "text-[var(--color-danger)]"
				: "text-[var(--color-text-tertiary)]"
	}`;
	const glyph = {
		size,
		strokeWidth: 1.8,
		className: kind === "running" ? `${className} motion-safe:animate-spin` : className,
		...(named ? { role: "img" as const, "aria-label": t(itemStateWordKey(item)) } : { "aria-hidden": true as const }),
	};
	if (kind === "running") return <Loader {...glyph} />;
	if (kind === "waiting") return <CircleHelp {...glyph} />;
	if (kind === "failed") return <CircleX {...glyph} />;
	if (kind === "paused") return <Pause {...glyph} />;
	return <Check {...glyph} />;
}

/** The word each mark announces. A finished item says so; a cancelled one says it was cancelled. */
const STATE_WORD: Record<ItemStateKind, string> = {
	running: "tasks.itemStateRunning",
	waiting: "tasks.itemStateWaitingUser",
	failed: "tasks.itemStateFailed",
	paused: "tasks.itemStatePaused",
	done: "tasks.itemStateCompleted",
};

/** A cancelled item still reads as finished in the list; its own word is 「已取消」. */
export function itemStateWordKey(item: ItemSummary): string {
	if (item.state === "cancelled") return "tasks.itemStateCancelled";
	return STATE_WORD[itemStateKind(item)];
}
