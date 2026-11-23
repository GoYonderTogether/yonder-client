import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.ts";
import { type RowAction, RowActionItem } from "./row-action-item.tsx";

/**
 * A row in a chat list, drawn the way Feishu and the WeChat desktop app draw theirs: rows lie flat
 * on the list column with no card or divider, and the open conversation uses the selected surface.
 * Settings lists keep the grouped-card look (`ListGroup`); this is for conversations.
 */
export interface ConversationRowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
	/** The avatar. */
	leading: ReactNode;
	title: ReactNode;
	/** The last message, one line. Left empty until there is one. */
	preview?: ReactNode;
	/** Top right: the time of the last message. */
	meta?: ReactNode;
	/** Bottom right: an unread badge, a pin, a mute mark. */
	badge?: ReactNode;
	selected?: boolean;
	actions?: readonly RowAction[] | undefined;
}

export function ConversationRow({
	leading,
	title,
	preview,
	meta,
	badge,
	selected = false,
	actions,
	className,
	type = "button",
	...rest
}: ConversationRowProps) {
	return (
		<RowActionItem actions={actions} className="rounded-[var(--radius-control)]">
			<button
				type={type}
				aria-current={selected ? "true" : undefined}
				className={cn(
					"flex w-full items-center gap-[var(--spacing-3)] rounded-[var(--radius-control)] px-[var(--spacing-3)] text-start",
					"h-[var(--conversation-row-height)]",
					"transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
					"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]",
					selected
						? "bg-[var(--color-bg-selected)]"
						: "hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-bg-active)]",
					className,
				)}
				{...rest}
			>
				<span className="pointer-events-none flex shrink-0 select-none items-center [-webkit-touch-callout:none]">
					{leading}
				</span>
				<span className="flex min-w-0 flex-1 flex-col gap-[2px]">
					<span className="flex items-baseline gap-[var(--spacing-2)]">
						<span className="min-w-0 flex-1 truncate text-body font-medium text-[var(--color-text-primary)]">
							{title}
						</span>
						{meta ? (
							<span className="shrink-0 whitespace-nowrap text-micro tabular-nums text-[var(--color-text-tertiary)]">
								{meta}
							</span>
						) : null}
					</span>
					{preview || badge ? (
						<span className="flex items-center gap-[var(--spacing-2)]">
							<span className="min-w-0 flex-1 truncate text-caption text-[var(--color-text-secondary)]">{preview}</span>
							{badge ? (
								<span className="flex shrink-0 items-center text-[var(--color-text-tertiary)]">{badge}</span>
							) : null}
						</span>
					) : null}
				</span>
			</button>
		</RowActionItem>
	);
}

/** The list that holds conversation rows: no card, just a little inset from the column edges. */
export function ConversationList({ children, label }: { children: ReactNode; label: string }) {
	return (
		<ul aria-label={label} className="flex flex-col gap-[2px] px-[var(--spacing-2)]">
			{children}
		</ul>
	);
}
