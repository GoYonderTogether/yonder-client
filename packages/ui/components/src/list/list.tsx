import { ICON_SIZE, ICON_STROKE } from "@yonder/ui-tokens";
import { ChevronRight } from "lucide-react";
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
			<ul className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-bg-surface)]">{children}</ul>
			{footer ? <p className="px-[var(--spacing-4)] text-caption text-[var(--color-text-tertiary)]">{footer}</p> : null}
		</section>
	);
}

export interface ListRowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title" | "value"> {
	/** An avatar or an icon tile. */
	leading?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	/** Right side, small and quiet: a time, a badge, a count. */
	trailing?: ReactNode;
	/** Right side, body size: the current value of a setting (手机号, 版本). */
	value?: ReactNode;
	/**
	 * Right side: a `Switch` or `Checkbox`. The row becomes the control's `<label>`, so a click
	 * anywhere on it toggles, and the title is the control's accessible name.
	 */
	control?: ReactNode;
	/** Shows a chevron: this row opens another screen. */
	chevron?: boolean;
	/** A row that only shows information: no button, no hover. */
	static?: boolean;
	selected?: boolean;
	/** Draws the title in the danger colour (sign out, delete). */
	tone?: "default" | "danger";
}

const ROW =
	"flex min-h-[var(--row-height)] w-full items-center gap-[var(--spacing-3)] px-[var(--spacing-4)] py-[var(--spacing-2)] text-start";
const PRESSABLE = cn(
	"transition-colors duration-[var(--duration-fast)]",
	"hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-bg-active)]",
	"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]",
);

/**
 * One row of a `ListGroup`. Four shapes share one layout: a button (default), a static row
 * (`static`), a value row (`value`), and a control row (`control`), so a settings screen never
 * hand-draws a row or a separator.
 */
export function ListRow({
	leading,
	title,
	subtitle,
	trailing,
	value,
	control,
	chevron = false,
	static: isStatic = false,
	selected = false,
	tone = "default",
	className,
	type = "button",
	...rest
}: ListRowProps) {
	const content = (
		<>
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
				{subtitle ? <span className="truncate text-caption text-[var(--color-text-tertiary)]">{subtitle}</span> : null}
			</span>
			{value ? (
				<span className="min-w-0 max-w-1/2 shrink truncate text-body text-[var(--color-text-secondary)]">{value}</span>
			) : null}
			{trailing ? <span className="shrink-0 text-caption text-[var(--color-text-tertiary)]">{trailing}</span> : null}
			{control ? <span className="flex shrink-0 items-center">{control}</span> : null}
			{chevron ? (
				<ChevronRight
					size={ICON_SIZE.sm}
					strokeWidth={ICON_STROKE.normal}
					aria-hidden="true"
					className="shrink-0 text-[var(--color-text-tertiary)]"
				/>
			) : null}
		</>
	);
	let row: ReactNode;
	if (control) {
		// biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in through `control` and rendered inside.
		row = <label className={cn(ROW, PRESSABLE, "cursor-pointer", className)}>{content}</label>;
	} else if (isStatic) {
		row = <div className={cn(ROW, className)}>{content}</div>;
	} else {
		row = (
			<button
				type={type}
				aria-current={selected ? "true" : undefined}
				className={cn(ROW, PRESSABLE, selected && "bg-[var(--color-bg-selected)]", className)}
				{...rest}
			>
				{content}
			</button>
		);
	}
	return (
		<li className="group/row relative">
			{row}
			{/* An inset hairline from the text edge, like iOS; the last row has none. */}
			<span className="pointer-events-none absolute end-0 bottom-0 start-[var(--spacing-4)] h-px bg-[var(--color-border-subtle)] group-last/row:hidden" />
		</li>
	);
}

/** A rounded tile holding a line icon: the leading slot of a settings row. */
export function IconTile({ children }: { children: ReactNode }) {
	return (
		<span
			aria-hidden
			className="flex size-8 items-center justify-center rounded-[var(--radius-control-sm)] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]"
		>
			{children}
		</span>
	);
}
