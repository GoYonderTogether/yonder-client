import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "../cn.ts";

export type FieldSize = "sm" | "md" | "lg";

export interface FieldProps {
	label: string;
	hint?: ReactNode;
	error?: ReactNode;
	htmlFor: string;
	children: ReactNode;
	action?: ReactNode;
}

export function Field({ label, hint, error, htmlFor, children, action }: FieldProps) {
	return (
		<div className="flex flex-col gap-[var(--spacing-2)]">
			<div className="flex items-center justify-between gap-[var(--spacing-3)]">
				<label htmlFor={htmlFor} className="text-caption font-medium text-[var(--color-text-secondary)]">
					{label}
				</label>
				{action}
			</div>
			{children}
			{hint || error ? (
				<p
					id={`${htmlFor}-hint`}
					className={cn("text-caption", error ? "text-[var(--color-danger)]" : "text-[var(--color-text-tertiary)]")}
					role={error ? "alert" : undefined}
				>
					{error ?? hint}
				</p>
			) : null}
		</div>
	);
}

export interface InputFrameProps {
	children: ReactNode;
	fieldSize?: FieldSize | undefined;
	invalid?: boolean | undefined;
	disabled?: boolean | undefined;
	/** For a visual cell whose real input receives focus elsewhere. */
	focused?: boolean;
	className?: string | undefined;
}

const FRAME_SIZES: Record<FieldSize, string> = {
	sm: "h-[var(--control-sm)] rounded-[var(--radius-control-sm)]",
	md: "h-[var(--control-md)] rounded-[var(--radius-control)]",
	lg: "h-[var(--control-lg)] rounded-[var(--radius-control)]",
};

/** The shared surface and focus treatment for every single-line input. */
export function InputFrame({ children, fieldSize = "md", invalid, disabled, focused, className }: InputFrameProps) {
	return (
		<div
			data-input-frame
			className={cn(
				"flex min-w-0 items-center gap-[var(--spacing-2)] border border-transparent bg-[var(--color-bg-subtle)] px-[var(--spacing-4)]",
				"transition-[background-color,border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
				!disabled &&
					"focus-within:border-[var(--color-accent)] focus-within:bg-[var(--color-bg-surface)] focus-within:shadow-[var(--focus-ring)]",
				focused && !disabled && "border-[var(--color-accent)] bg-[var(--color-bg-surface)] shadow-[var(--focus-ring)]",
				invalid && "!border-[var(--color-danger)]",
				disabled && "cursor-not-allowed opacity-60",
				FRAME_SIZES[fieldSize],
				className,
			)}
		>
			{children}
		</div>
	);
}

export const INPUT_CLASS =
	"min-w-0 w-full flex-1 bg-transparent text-body text-[var(--color-text-primary)] outline-none focus-visible:outline-none focus-visible:shadow-none placeholder:text-[var(--color-text-tertiary)] disabled:cursor-not-allowed";

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
	invalid?: boolean;
	fieldSize?: FieldSize;
	trailing?: ReactNode;
}

/** Backwards-compatible unlabelled field, for callers that provide a Field wrapper. */
export function TextInput({ invalid = false, trailing, className, id, fieldSize, disabled, ...rest }: TextInputProps) {
	const generated = useId();
	const inputId = id ?? generated;
	return (
		<InputFrame invalid={invalid} disabled={disabled} fieldSize={fieldSize} className={className}>
			<input
				id={inputId}
				aria-invalid={invalid || undefined}
				aria-describedby={invalid ? `${inputId}-hint` : undefined}
				disabled={disabled}
				className={INPUT_CLASS}
				{...rest}
			/>
			{trailing}
		</InputFrame>
	);
}

export interface TextFieldProps extends TextInputProps {
	label: string;
	hint?: ReactNode;
	error?: ReactNode;
	action?: ReactNode;
}

export function TextField({
	label,
	hint,
	error,
	action,
	id,
	invalid,
	"aria-describedby": describedBy,
	...rest
}: TextFieldProps) {
	const generated = useId();
	const inputId = id ?? generated;
	return (
		<Field label={label} hint={hint} error={error} action={action} htmlFor={inputId}>
			<TextInput
				id={inputId}
				invalid={invalid || Boolean(error)}
				aria-describedby={describedBy ?? (hint || error ? `${inputId}-hint` : undefined)}
				{...rest}
			/>
		</Field>
	);
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
	invalid?: boolean;
}

export function TextArea({ invalid = false, className, id, ...rest }: TextAreaProps) {
	const generated = useId();
	const areaId = id ?? generated;
	return (
		<textarea
			id={areaId}
			aria-invalid={invalid || undefined}
			aria-describedby={`${areaId}-hint`}
			className={cn(
				"min-h-[88px] w-full resize-y rounded-[var(--radius-control)] border border-transparent bg-[var(--color-bg-subtle)]",
				"px-[var(--spacing-4)] py-[var(--spacing-3)] text-body text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]",
				"focus:border-[var(--color-accent)] focus:bg-[var(--color-bg-surface)] focus:shadow-[var(--focus-ring)]",
				invalid && "!border-[var(--color-danger)]",
				className,
			)}
			{...rest}
		/>
	);
}
