import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "../cn.ts";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role" | "children"> {
	ref?: Ref<HTMLInputElement>;
	/** Saving: blocks input and says so to assistive technology. */
	busy?: boolean;
}

/**
 * An on/off control that takes effect at once (04-组件: settings that need a save button use
 * `Checkbox`). A real checkbox carries the state, focus and name, so a wrapping `<label>` or an
 * `aria-label` names it. Track 40×24, knob 16, accent when on.
 */
export function Switch({ ref, busy = false, disabled, checked, className, ...props }: SwitchProps) {
	return (
		<span className={cn("relative inline-flex shrink-0", className)}>
			<input
				{...props}
				ref={ref}
				type="checkbox"
				role="switch"
				checked={checked}
				aria-checked={checked ?? props.defaultChecked ?? false}
				disabled={disabled || busy}
				aria-busy={busy || undefined}
				className={cn(
					"peer h-[var(--spacing-6)] w-[var(--spacing-10)] cursor-pointer appearance-none rounded-[var(--radius-full)] bg-[var(--color-border-strong)]",
					"transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] checked:bg-[var(--color-accent)]",
					"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
					"disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)]",
				)}
			/>
			<span
				aria-hidden
				className={cn(
					"pointer-events-none absolute top-[var(--spacing-1)] left-[var(--spacing-1)] size-[var(--spacing-4)] rounded-[var(--radius-full)] bg-[var(--color-switch-thumb)] shadow-[var(--shadow-xs)]",
					"transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)] peer-checked:translate-x-[var(--spacing-4)]",
				)}
			/>
		</span>
	);
}
