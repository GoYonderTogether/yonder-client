import type { ReactNode } from "react";
import { cn } from "../cn.ts";

export interface EmptyStateProps {
	/** A Lucide icon element, not an emoji. */
	icon?: ReactNode;
	title: string;
	body?: ReactNode;
	/** Chips or buttons that give the user something to do. */
	action?: ReactNode;
	/**
	 * `page` (default) fills an empty screen. `inline` is one quiet line inside a list or a section
	 * (no devices, no Bots yet); pass `as="li"` when it sits inside a `ListGroup`.
	 */
	variant?: "page" | "inline";
	as?: "div" | "li";
	className?: string;
}

/**
 * Never leave a page blank: a title, one honest sentence, and something to click (02-视觉样式 第九节).
 * The sentence says what will be here, not that something failed. The icon sits on a soft grey
 * tile rather than an accent disc, so an empty screen stays calm.
 */
export function EmptyState({
	icon,
	title,
	body,
	action,
	variant = "page",
	as: Tag = "div",
	className,
}: EmptyStateProps) {
	if (variant === "inline") {
		return (
			<Tag
				className={cn(
					"flex min-h-[var(--row-height)] flex-wrap items-center gap-x-[var(--spacing-3)] gap-y-[var(--spacing-1)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-caption text-[var(--color-text-tertiary)]",
					className,
				)}
			>
				{icon ? (
					<span aria-hidden className="flex shrink-0 items-center">
						{icon}
					</span>
				) : null}
				<span className="min-w-0 flex-1">
					<span className="text-[var(--color-text-secondary)]">{title}</span>
					{body ? <span className="block">{body}</span> : null}
				</span>
				{action ? <span className="flex shrink-0 items-center gap-[var(--spacing-2)]">{action}</span> : null}
			</Tag>
		);
	}
	return (
		<Tag
			className={cn(
				"mx-auto flex w-full max-w-[calc(var(--width-form)-var(--spacing-5))] animate-fade-in flex-col items-center gap-[var(--spacing-2)] px-[var(--spacing-6)] py-[var(--spacing-12)] text-center",
				className,
			)}
		>
			{icon ? (
				<span
					aria-hidden
					className="mb-[var(--spacing-2)] flex size-14 items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]"
				>
					{icon}
				</span>
			) : null}
			<h2 className="text-h3 font-semibold text-[var(--color-text-primary)]">{title}</h2>
			{body ? <p className="text-caption text-[var(--color-text-secondary)]">{body}</p> : null}
			{action ? (
				<div className="mt-[var(--spacing-3)] flex flex-wrap justify-center gap-[var(--spacing-2)]">{action}</div>
			) : null}
		</Tag>
	);
}
