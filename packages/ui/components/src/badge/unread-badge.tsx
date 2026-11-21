import type { HTMLAttributes } from "react";
import { cn } from "../cn.ts";

export function UnreadBadge({
	count,
	label,
	className,
	dot,
	muted,
	...props
}: HTMLAttributes<HTMLSpanElement> & { count: number; label: string; dot?: boolean; muted?: boolean }) {
	if (!count) return null;
	const renderDot = dot || muted;
	return (
		<span
			{...props}
			role="img"
			aria-label={label}
			className={cn(
				"block shrink-0 rounded-[var(--radius-full)]",
				muted ? "bg-[var(--color-text-tertiary)]" : "bg-[var(--color-danger)]",
				renderDot
					? "size-[var(--spacing-2)]"
					: "min-w-[var(--spacing-4)] px-[var(--spacing-1)] text-center text-micro font-medium tabular-nums text-[var(--color-danger-inverse)]",
				className,
			)}
		>
			{renderDot ? <span className="sr-only">{label}</span> : count > 99 ? "99+" : count}
		</span>
	);
}
