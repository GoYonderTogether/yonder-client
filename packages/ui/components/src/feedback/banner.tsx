import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.ts";

export type BannerTone = "info" | "warning" | "danger";

const TONES: Record<BannerTone, string> = {
	// The quiet grey every existing notice already used; most banners are this one.
	info: "bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]",
	warning:
		"bg-[var(--color-warning-subtle)] text-[var(--color-text-primary)] [&>[data-banner-icon]]:text-[var(--color-warning)]",
	danger:
		"bg-[var(--color-danger-subtle)] text-[var(--color-text-primary)] [&>[data-banner-icon]]:text-[var(--color-danger)]",
};

export interface BannerProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
	tone?: BannerTone;
	/** A lucide icon at `ICON_SIZE.sm`. */
	icon?: ReactNode;
	children: ReactNode;
	/** One or two `Button variant="link" size="sm"`, placed after the text. */
	action?: ReactNode;
}

/**
 * A persistent notice at the top of a page or above the composer (04-组件 Banner): quota used up, a
 * closed group, a visit waiting for approval. One per page. Info and warning are a status;
 * danger interrupts as an alert.
 */
export function Banner({ tone = "info", icon, children, action, className, role, ...rest }: BannerProps) {
	return (
		<section
			{...rest}
			role={role ?? (tone === "danger" ? "alert" : "status")}
			data-tone={tone}
			className={cn(
				"flex flex-wrap items-center gap-x-[var(--spacing-3)] gap-y-[var(--spacing-2)] rounded-[var(--radius-control)] px-[var(--spacing-4)] py-[var(--spacing-2)] text-caption",
				TONES[tone],
				className,
			)}
		>
			{icon ? (
				<span data-banner-icon aria-hidden className="flex shrink-0 items-center">
					{icon}
				</span>
			) : null}
			<div className="min-w-0 flex-1">{children}</div>
			{action ? <div className="flex shrink-0 items-center gap-[var(--spacing-1)]">{action}</div> : null}
		</section>
	);
}
