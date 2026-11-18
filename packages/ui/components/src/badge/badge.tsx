import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.ts";

export type BadgeTone = "neutral" | "accent" | "danger";

const TONES: Record<BadgeTone, string> = {
	neutral: "bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]",
	accent: "bg-[var(--color-accent-subtle)] text-[var(--color-accent-text)]",
	danger: "bg-[var(--color-danger-subtle)] text-[var(--color-danger)]",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	tone?: BadgeTone;
	children: ReactNode;
}

/**
 * A small status mark beside a title: a member's role, 「等你处理」, an unread count. Micro text on a
 * tinted 4px-radius block; colour only ever covers this small area (04-组件 Badge). At most two in
 * a row.
 */
export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
	return (
		<span
			{...rest}
			className={cn(
				"inline-flex shrink-0 items-center rounded-[var(--radius-xs)] px-[var(--spacing-1)] text-micro font-medium tabular-nums",
				TONES[tone],
				className,
			)}
		>
			{children}
		</span>
	);
}
