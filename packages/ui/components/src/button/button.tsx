import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "../cn.ts";
import { Spinner } from "../feedback/loading.tsx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "destructive" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	/** Shows a spinner and blocks input; the width does not change. */
	loading?: boolean;
	/** Fills the container. */
	block?: boolean;
	children?: ReactNode;
}

/*
 * No black buttons (样式规范第 2 条). The primary action is the accent; everything else is a
 * filled grey that darkens on hover, so a screen full of buttons stays quiet.
 */
const VARIANTS: Record<ButtonVariant, string> = {
	primary: "bg-[var(--color-accent)] text-[var(--color-text-inverse)] enabled:hover:bg-[var(--color-accent-hover)]",
	secondary:
		"bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)] enabled:hover:bg-[var(--color-bg-subtle-hover)]",
	ghost: "bg-transparent text-[var(--color-text-primary)] enabled:hover:bg-[var(--color-bg-hover)]",
	danger:
		"bg-[var(--color-danger-subtle)] text-[var(--color-danger)] enabled:hover:bg-[var(--color-danger)] enabled:hover:text-[var(--color-danger-inverse)]",
	/* The button that commits an irreversible action inside a confirmation: solid, so it reads as the weighty choice. */
	destructive:
		"bg-[var(--color-danger)] text-[var(--color-danger-inverse)] enabled:hover:brightness-90 enabled:active:brightness-90",
	link: "bg-transparent text-[var(--color-accent-text)] enabled:hover:text-[var(--color-accent-hover)] enabled:hover:underline",
};

const SIZES: Record<ButtonSize, string> = {
	sm: "h-[var(--control-sm)] px-[var(--spacing-3)] text-caption rounded-[var(--radius-control-sm)]",
	md: "h-[var(--control-md)] px-[var(--spacing-4)] text-body rounded-[var(--radius-control)]",
	lg: "h-[var(--control-lg)] px-[var(--spacing-5)] text-body rounded-[var(--radius-control)]",
};

/**
 * Trigger an action. One `primary` per region; `danger` needs a confirmation somewhere nearby.
 * Loading keeps the label in the layout so the button does not jump.
 */
export function Button({
	variant = "secondary",
	size = "md",
	loading = false,
	block = false,
	className,
	disabled,
	children,
	type = "button",
	...rest
}: ButtonProps) {
	return (
		<button
			type={type}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			className={cn(
				"relative inline-flex select-none items-center justify-center gap-[var(--spacing-2)] font-medium",
				"transition-[background-color,color,transform,scale,opacity] duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
				"motion-safe:enabled:active:scale-[0.97]",
				"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
				"disabled:cursor-not-allowed disabled:opacity-[var(--opacity-disabled)]",
				VARIANTS[variant],
				"aria-pressed:bg-[var(--color-bg-selected)] aria-pressed:text-[var(--color-text-primary)] aria-pressed:enabled:hover:bg-[var(--color-bg-selected)]",
				SIZES[size],
				variant === "link" && "px-0!",
				block && "w-full",
				className,
			)}
			{...rest}
		>
			{loading ? <Spinner size="sm" className="absolute" /> : null}
			<span className={cn("inline-flex min-w-0 items-center justify-center gap-[inherit]", loading && "opacity-0")}>
				{children}
			</span>
		</button>
	);
}
