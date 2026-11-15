import type { KeyboardEvent, ReactNode } from "react";
import { useId } from "react";
import { cn } from "../cn.ts";

export interface SegmentOption {
	value: string;
	label: ReactNode;
	disabled?: boolean;
}

export interface SegmentedProps {
	"aria-label": string;
	options: readonly SegmentOption[];
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	className?: string;
}

/** A single-choice group with roving focus and arrow-key selection. */
export function Segmented({ options, value, onChange, disabled = false, className, ...props }: SegmentedProps) {
	const name = useId();
	const enabled = options.filter((option) => !option.disabled);
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (disabled || enabled.length === 0) return;
		const current = Math.max(
			0,
			enabled.findIndex((option) => option.value === value),
		);
		let next: number;
		switch (event.key) {
			case "ArrowRight":
			case "ArrowDown":
				next = (current + 1) % enabled.length;
				break;
			case "ArrowLeft":
			case "ArrowUp":
				next = (current + enabled.length - 1) % enabled.length;
				break;
			case "Home":
				next = 0;
				break;
			case "End":
				next = enabled.length - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		const selected = enabled[next];
		if (!selected) return;
		onChange(selected.value);
		event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="radio"]:not(:disabled)')[next]?.focus();
	};
	return (
		<div
			{...props}
			role="radiogroup"
			aria-disabled={disabled || undefined}
			onKeyDown={onKeyDown}
			className={cn(
				"inline-flex h-[var(--control-sm)] items-stretch gap-1 rounded-[var(--radius-control-sm)] bg-[var(--color-bg-subtle)] p-1",
				className,
			)}
		>
			{options.map((option) => (
				<label
					key={option.value}
					className={cn(
						"relative inline-flex cursor-pointer items-stretch rounded-[var(--radius-xs)] text-caption text-[var(--color-text-secondary)] transition-[transform,scale] duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
						!disabled && !option.disabled && "hover:text-[var(--color-text-primary)] motion-safe:active:scale-[0.97]",
						(disabled || option.disabled) && "cursor-not-allowed opacity-60",
					)}
				>
					<input
						type="radio"
						name={name}
						value={option.value}
						checked={value === option.value}
						tabIndex={
							value === option.value ||
							(!options.some((item) => item.value === value && !item.disabled) && enabled[0]?.value === option.value)
								? 0
								: -1
						}
						disabled={disabled || option.disabled}
						onChange={() => onChange(option.value)}
						className="peer absolute inset-0 size-full opacity-0"
					/>
					<span
						className={cn(
							"flex items-center rounded-[var(--radius-xs)] px-[var(--spacing-2)] transition-colors duration-[var(--duration-fast)] peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--color-accent)] peer-focus-visible:shadow-[var(--focus-ring)]",
							value === option.value &&
								"bg-[var(--color-bg-selected)] text-[var(--color-text-primary)] shadow-[var(--shadow-xs)]",
						)}
					>
						{option.label}
					</span>
				</label>
			))}
		</div>
	);
}
