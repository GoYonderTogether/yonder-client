import { Check } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../cn.ts";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> {
	children?: ReactNode;
	ref?: Ref<HTMLInputElement>;
}

/** The real input carries the state, accessible name, and focus. */
export function Checkbox({ children, className, disabled, ref, ...props }: CheckboxProps) {
	return (
		<label
			className={cn(
				"inline-flex items-start gap-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]",
				disabled && "opacity-60",
				className,
			)}
		>
			<span className="relative mt-px flex size-[18px] shrink-0">
				<input
					{...props}
					ref={ref}
					type="checkbox"
					disabled={disabled}
					className="peer size-[18px] appearance-none rounded-[5px] border-2 border-[var(--color-text-tertiary)] bg-[var(--color-bg-subtle)] checked:border-[var(--color-text-primary)] checked:bg-[var(--color-bg-selected)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed"
				/>
				<Check
					aria-hidden
					size={14}
					strokeWidth={3}
					className="pointer-events-none absolute inset-[2px] text-[var(--color-text-primary)] opacity-0 peer-checked:opacity-100"
				/>
			</span>
			{children ? <span>{children}</span> : null}
		</label>
	);
}
