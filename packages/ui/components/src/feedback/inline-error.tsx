import type { ReactNode } from "react";
import { Button } from "../button/button.tsx";
import { cn } from "../cn.ts";

export interface InlineErrorProps {
	/** The real reason, from the server or the platform; never a softened stand-in. */
	children: ReactNode;
	/** Shows a link-style retry after the message. */
	onRetry?: () => void;
	retryLabel?: string;
	/** `li` when the error replaces the rows of a `ListGroup`. */
	as?: "div" | "li";
	className?: string;
}

/**
 * The one style for a failure next to the thing that failed: danger caption text, announced once
 * through `role="alert"`, with an optional retry. A failure that blocks the whole page uses
 * `EmptyState` with a retry action instead.
 */
export function InlineError({ children, onRetry, retryLabel, as: Tag = "div", className }: InlineErrorProps) {
	return (
		<Tag
			role="alert"
			className={cn(
				"flex flex-wrap items-center gap-x-[var(--spacing-2)] gap-y-[var(--spacing-1)] text-caption text-[var(--color-danger)]",
				Tag === "li" && "px-[var(--spacing-4)] py-[var(--spacing-3)]",
				className,
			)}
		>
			<span className="min-w-0">{children}</span>
			{onRetry && retryLabel ? (
				<Button variant="link" size="sm" onClick={onRetry} className="h-auto">
					{retryLabel}
				</Button>
			) : null}
		</Tag>
	);
}
