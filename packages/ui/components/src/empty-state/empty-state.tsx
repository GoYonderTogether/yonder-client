import type { ReactNode } from "react";
import { cn } from "../cn.ts";

export interface EmptyStateProps {
	/** A Lucide icon element, not an emoji. */
	icon?: ReactNode;
	title: string;
	body?: ReactNode;
	/** Chips or buttons that give the user something to do. */
	action?: ReactNode;
	className?: string;
}

/**
 * Never leave a page blank: a title, one honest sentence, and something to click (02-视觉样式 第九节).
 * The sentence says what will be here, not that something failed. The icon sits on a soft grey
 * tile rather than an accent disc, so an empty screen stays calm.
 */
export function EmptyState({ icon, title, body, action, className }: EmptyStateProps) {
	return (
		<div
			className={cn(
				"mx-auto flex w-full max-w-[380px] animate-fade-in flex-col items-center gap-[var(--spacing-2)] px-[var(--spacing-6)] py-[var(--spacing-12)] text-center",
				className,
			)}
		>
			{icon ? (
				<span
					aria-hidden
					className="mb-[var(--spacing-2)] flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]"
				>
					{icon}
				</span>
			) : null}
			<h2 className="text-h3 font-semibold text-[var(--color-text-primary)]">{title}</h2>
			{body ? <p className="text-caption text-[var(--color-text-secondary)]">{body}</p> : null}
			{action ? (
				<div className="mt-[var(--spacing-3)] flex flex-wrap justify-center gap-[var(--spacing-2)]">{action}</div>
			) : null}
		</div>
	);
}
