import type { HTMLAttributes } from "react";
import { cn } from "../cn.ts";

export type SpinnerSize = "sm" | "md" | "lg";

const SPINNER_SIZES: Record<SpinnerSize, string> = {
	sm: "size-[var(--icon-sm)]",
	md: "size-[var(--icon-md)]",
	lg: "size-[var(--icon-lg)]",
};

export interface SpinnerProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
	/** 16 / 20 / 24, the icon sizes. */
	size?: SpinnerSize;
	/** When given, the spinner announces itself as a status; otherwise it is decorative. */
	label?: string;
}

/**
 * The one spinner (03-动效 M17): a ring in the current text colour, one 800ms turn. Under reduced
 * motion it stays still, so it reads as a static ring rather than disappearing.
 */
export function Spinner({ size = "md", label, className, ...rest }: SpinnerProps) {
	const ring = cn(
		"inline-block shrink-0 rounded-[var(--radius-full)] border-2 border-current border-t-transparent motion-safe:animate-spinner",
		SPINNER_SIZES[size],
		className,
	);
	if (label) {
		return <span {...rest} role="status" aria-label={label} className={ring} />;
	}
	return <span {...rest} aria-hidden="true" className={ring} />;
}

export interface LoadingRowProps {
	/** The visible text, usually `t("app.loading")`. */
	label: string;
	/** `li` when the row sits inside a `ListGroup`. */
	as?: "div" | "li";
	className?: string;
}

/** A section or list that is still loading: a small spinner and one quiet line, centred. */
export function LoadingRow({ label, as: Tag = "div", className }: LoadingRowProps) {
	return (
		<Tag
			role="status"
			className={cn(
				"flex min-h-[var(--row-height)] items-center justify-center gap-[var(--spacing-2)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-caption text-[var(--color-text-tertiary)]",
				className,
			)}
		>
			<Spinner size="sm" />
			<span>{label}</span>
		</Tag>
	);
}
