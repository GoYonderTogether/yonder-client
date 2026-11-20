import type { HTMLAttributes } from "react";
import { cn } from "../cn.ts";

export function UnreadBadge({
	count,
	label,
	className,
	dot,
	...props
}: HTMLAttributes<HTMLSpanElement> & { count: number; label: string; dot?: boolean }) {
	if (!count) return null;
	return (
		<span
			{...props}
			role="img"
			aria-label={label}
			className={cn(
				"block shrink-0 rounded-[var(--radius-full)] bg-[var(--color-danger)]",
				dot
					? "size-[var(--spacing-2)]"
					: "min-w-[var(--spacing-4)] px-[var(--spacing-1)] text-center text-micro font-medium tabular-nums text-[var(--color-danger-inverse)]",
				className,
			)}
		>
			{dot ? <span className="sr-only">{label}</span> : count > 99 ? "99+" : count}
		</span>
	);
}
