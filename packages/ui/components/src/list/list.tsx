import { Check } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { cn } from "../cn.ts";
import { type RowAction, RowActionItem } from "./row-action-item.tsx";

/**
 * Settings sections (docs/settings-forms.md): a semibold title, a solid hairline under it, rows
 * split by dashed lines, the footer explaining the whole section. A section is a card, so its fill
 * follows the surface under it — grey on a white page, white on a grey column — and sections stand
 * apart by the gap between cards. A section that follows another one adds a top margin on top of
 * its column's gap, so two sections always stand at least 32px apart whatever column they sit in.
 */
const SECTION = "flex min-w-0 flex-col gap-[var(--spacing-2)] [section+&]:mt-[var(--spacing-4)]";
/** The group's name above its card, the way a grouped list labels a block (iOS, WeChat). */
const SECTION_TITLE = "px-[var(--spacing-2)] text-caption font-medium text-[var(--color-text-tertiary)]";
const SECTION_FOOTER = "px-[var(--spacing-2)] text-caption text-[var(--color-text-tertiary)]";
/** The dashed line between rows; `last:` drops it after the final row. */
const ROW_LINE = "border-b border-dashed border-[var(--color-border)] last:border-b-0";

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
	/** @deprecated Ignored: every section is a card. Kept until the last caller drops it. */
	variant?: "settings" | "card";
}) {
	return (
		<section className={cn(SECTION, className)}>
			{title ? <h2 className={SECTION_TITLE}>{title}</h2> : null}
			<ul className="flex flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-bg-card)]">
				{children}
			</ul>
			{footer ? <p className={SECTION_FOOTER}>{footer}</p> : null}
		</section>
	);
}

/** A section of form fields: the same title, rule and footer as a list section, with free content. */
export function FormSection({
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
		<section className={cn(SECTION, className)}>
			{title ? <h2 className={SECTION_TITLE}>{title}</h2> : null}
			<div className="flex flex-col gap-[var(--spacing-4)] rounded-[var(--radius-card)] bg-[var(--color-bg-card)] p-[var(--spacing-4)]">
				{children}
			</div>
			{footer ? <p className={SECTION_FOOTER}>{footer}</p> : null}
		</section>
	);
}

export interface ListRowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
	/** An avatar or an icon tile. */
	leading?: ReactNode;
	title: ReactNode;
	wrapTitle?: boolean;
	subtitle?: ReactNode;
	/** Right side: a value, a time, a badge. */
	trailing?: ReactNode;
	/** Shows a chevron: this row opens another screen. */
	chevron?: boolean;
	selected?: boolean;
	/** `danger` for delete and sign out; `accent` for a row that runs an action (connect). */
	tone?: "default" | "danger" | "accent";
	actions?: readonly RowAction[] | undefined;
}

const ROW_BODY =
	"flex min-h-[var(--row-height)] w-full items-center gap-[var(--spacing-3)] rounded-[var(--radius-sm)] px-[var(--spacing-4)] py-[var(--spacing-2)] text-start";

export function ListRow({
	leading,
	title,
	wrapTitle = false,
	subtitle,
	trailing,
	chevron = false,
	selected = false,
	tone = "default",
	actions,
	className,
	type = "button",
	...rest
}: ListRowProps) {
	return (
		<RowActionItem actions={actions} className={ROW_LINE}>
			<button
				type={type}
				aria-current={selected ? "true" : undefined}
				className={cn(
					ROW_BODY,
					"transition-colors duration-[var(--duration-fast)]",
					"enabled:hover:bg-[var(--color-bg-hover)] enabled:active:bg-[var(--color-bg-active)] disabled:cursor-default",
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
							"text-body",
							!wrapTitle && "truncate",
							tone === "danger"
								? "text-[var(--color-danger)]"
								: tone === "accent"
									? "text-[var(--color-accent-text)]"
									: "text-[var(--color-text-primary)]",
						)}
					>
						{title}
					</span>
					{subtitle ? (
						<span className="truncate text-caption text-[var(--color-text-tertiary)]">{subtitle}</span>
					) : null}
				</span>
				{trailing ? (
					<span className="max-w-[55%] shrink-0 truncate text-body text-[var(--color-text-tertiary)]">{trailing}</span>
				) : null}
				{chevron ? <Chevron /> : null}
			</button>
		</RowActionItem>
	);
}

/** A row that only shows a value (a status, a connected account); nothing happens on tap. */
export function ListValue({
	title,
	value,
	tone = "default",
}: {
	title: string;
	value: ReactNode;
	tone?: "default" | "success" | "danger";
}) {
	return (
		<li className={ROW_LINE}>
			<div className={ROW_BODY}>
				<span className="min-w-0 flex-1 truncate text-body text-[var(--color-text-primary)]">{title}</span>
				<span
					className={cn(
						"max-w-[60%] shrink-0 truncate text-body",
						tone === "success"
							? "text-[var(--color-success)]"
							: tone === "danger"
								? "text-[var(--color-danger)]"
								: "text-[var(--color-text-tertiary)]",
					)}
				>
					{value}
				</span>
			</div>
		</li>
	);
}

/**
 * The end of an edit form: one primary button (docs/settings-forms.md). Full width on a phone-sized
 * column, right-aligned on a desktop one; there is no Cancel because back cancels.
 */
export function FormFooter({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col gap-[var(--spacing-2)] pt-[var(--spacing-2)] sm:flex-row sm:items-center sm:justify-end [&>button]:w-full sm:[&>button]:w-auto">
			{children}
		</div>
	);
}

/** A setting that is on or off. The whole row is the control; it saves the moment it changes. */
export function ListSwitch({
	title,
	subtitle,
	checked,
	onChange,
	busy = false,
	disabled = false,
	error,
}: {
	title: string;
	subtitle?: ReactNode;
	checked: boolean;
	onChange: (value: boolean) => void;
	busy?: boolean;
	disabled?: boolean;
	/** Why the last change did not save; shown under the row. */
	error?: ReactNode;
}) {
	const id = useId();
	return (
		<li className={ROW_LINE}>
			<label
				htmlFor={id}
				className={cn(
					ROW_BODY,
					"cursor-pointer hover:bg-[var(--color-bg-hover)]",
					(disabled || busy) && "cursor-default hover:bg-transparent",
				)}
			>
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="text-body text-[var(--color-text-primary)]">{title}</span>
					{subtitle ? <span className="text-caption text-[var(--color-text-tertiary)]">{subtitle}</span> : null}
				</span>
				<input
					id={id}
					type="checkbox"
					role="switch"
					aria-checked={checked}
					aria-busy={busy || undefined}
					checked={checked}
					disabled={disabled || busy}
					onChange={(event) => onChange(event.target.checked)}
					className={cn(
						"relative h-[var(--spacing-6)] w-[var(--spacing-10)] shrink-0 cursor-pointer appearance-none rounded-[var(--radius-full)] bg-[var(--color-border-strong)] transition-colors duration-[var(--duration-fast)]",
						"checked:bg-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60",
						"before:absolute before:top-[var(--spacing-1)] before:left-[var(--spacing-1)] before:size-[var(--spacing-4)] before:rounded-[var(--radius-full)] before:bg-[var(--color-switch-thumb)] before:transition-transform before:duration-[var(--duration-fast)] before:content-['']",
						"checked:before:translate-x-[var(--spacing-4)]",
						"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
					)}
				/>
			</label>
			{error ? (
				<p role="alert" className="px-[var(--spacing-1)] pb-[var(--spacing-2)] text-caption text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
		</li>
	);
}

/** One choice of several (a radio group): a check mark on the right marks the chosen row. */
export function ListOption({
	name,
	value,
	checked,
	onSelect,
	leading,
	title,
	subtitle,
	trailing,
	disabled = false,
}: {
	/** The radio group's name, shared by every option of one question. */
	name: string;
	value: string;
	checked: boolean;
	onSelect: () => void;
	leading?: ReactNode;
	title: string;
	subtitle?: ReactNode;
	trailing?: ReactNode;
	disabled?: boolean;
}) {
	return (
		<li className={ROW_LINE}>
			<label className={cn(ROW_BODY, "cursor-pointer hover:bg-[var(--color-bg-hover)]", disabled && "cursor-default")}>
				{leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
				<span className="flex min-w-0 flex-1 flex-col">
					<span className="truncate text-body text-[var(--color-text-primary)]">{title}</span>
					{subtitle ? (
						<span className="truncate text-caption text-[var(--color-text-tertiary)]">{subtitle}</span>
					) : null}
				</span>
				{trailing ? <span className="shrink-0 text-caption text-[var(--color-text-tertiary)]">{trailing}</span> : null}
				<span className="relative flex size-[var(--spacing-6)] shrink-0 items-center justify-center">
					<input
						type="radio"
						name={name}
						value={value}
						aria-label={title}
						checked={checked}
						disabled={disabled}
						onChange={onSelect}
						className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-[var(--radius-full)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-default"
					/>
					<Check
						size={20}
						strokeWidth={2.4}
						aria-hidden="true"
						className="pointer-events-none text-[var(--color-accent)] opacity-0 peer-checked:opacity-100"
					/>
				</span>
			</label>
		</li>
	);
}

/** A rounded tile holding a line icon: the leading slot of a settings row. */
/** A rounded tile behind an icon; with a `tone` (a --color-* token name) it is a solid colour tile with a light glyph. */
export function IconTile({ children, tone }: { children: ReactNode; tone?: string | undefined }) {
	return (
		<span
			aria-hidden
			className={
				tone
					? "flex size-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-on-accent)]"
					: "flex size-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]"
			}
			style={tone ? { backgroundColor: `var(--color-${tone})` } : undefined}
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
