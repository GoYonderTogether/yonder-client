import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.ts";

/**
 * Grouped lists, the way every settings screen and chat list a user already knows is drawn: rows
 * on a white card, a quiet title above the group, a hairline between rows that stops short of the
 * icon. Used by the conversation list and by 「我」.
 */
export function ListGroup({
	title,
	footer,
	children,
	className,
}: {
	title?: ReactNode;
	footer?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("flex flex-col gap-[var(--spacing-2)]", className)}>
			{title ? (
				<h3 className="px-[var(--spacing-4)] text-caption font-medium text-[var(--color-text-tertiary)]">{title}</h3>
			) : null}
			<ul className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)]">{children}</ul>
			{footer ? <p className="px-[var(--spacing-4)] text-caption text-[var(--color-text-tertiary)]">{footer}</p> : null}
		</section>
	);
}

export interface ListRowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
	/** An avatar or an icon tile. */
	leading?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	/** Right side: a value, a time, a badge. */
	trailing?: ReactNode;
	/** Shows a chevron: this row opens another screen. */
	chevron?: boolean;
	selected?: boolean;
	/** Draws the title in the danger colour (sign out, delete). */
	tone?: "default" | "danger";
}

export function ListRow({
	leading,
	title,
	subtitle,
	trailing,
	chevron = false,
	selected = false,
	tone = "default",
	className,
	type = "button",
	...rest
}: ListRowProps) {
	return (
		<li className="group/row relative">
			<button
				type={type}
				aria-current={selected ? "true" : undefined}
				className={cn(
					"flex min-h-[var(--row-height)] w-full items-center gap-[var(--spacing-3)] px-[var(--spacing-4)] py-[var(--spacing-2)] text-start",
					"transition-colors duration-[var(--duration-fast)]",
					"hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-bg-active)]",
					"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]",
					selected && "bg-[var(--color-bg-selected)]",
					className,
				)}
				{...rest}
			>
				{leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
				<span className="flex min-w-0 flex-1 flex-col">
					<span
						className={cn(
							"truncate text-body",
							tone === "danger" ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]",
						)}
					>
						{title}
					</span>
					{subtitle ? (
						<span className="truncate text-caption text-[var(--color-text-tertiary)]">{subtitle}</span>
					) : null}
				</span>
				{trailing ? <span className="shrink-0 text-caption text-[var(--color-text-tertiary)]">{trailing}</span> : null}
				{chevron ? <Chevron /> : null}
			</button>
			{/* The hairline starts after the leading slot, like iOS; the last row has none. */}
			<span className="pointer-events-none absolute end-0 bottom-0 start-[var(--spacing-4)] h-px bg-[var(--color-border-subtle)] group-last/row:hidden" />
		</li>
	);
}

/** A rounded tile holding a line icon: the leading slot of a settings row. */
export function IconTile({ children }: { children: ReactNode }) {
	return (
		<span
			aria-hidden
			className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]"
		>
			{children}
		</span>
	);
}

function Chevron() {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 16 16"
			fill="none"
			aria-hidden="true"
			className="shrink-0 text-[var(--color-text-tertiary)]"
		>
			<path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}
