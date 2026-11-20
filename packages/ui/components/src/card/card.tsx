import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn.ts";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
	variant?: "plain" | "raised" | "interactive";
	children?: ReactNode;
}

/** The product's basic unit: a surface with a large radius (04-组件 Card). */
export function Card({ variant = "plain", className, children, ...rest }: CardProps) {
	return (
		<div
			className={cn(
				// The fill comes from the surface under the card, so it is never the page's own colour.
				"rounded-[var(--radius-card)] bg-[var(--color-bg-card)]",
				"p-[var(--card-padding)]",
				variant === "raised" && "shadow-[var(--shadow-sm)]",
				variant === "interactive" &&
					"cursor-pointer transition-[transform,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-standard)] hover:shadow-[var(--shadow-sm)] active:scale-[0.99]",
				className,
			)}
			{...rest}
		>
			{children}
		</div>
	);
}

export function CardHeader({ title, meta, action }: { title: ReactNode; meta?: ReactNode; action?: ReactNode }) {
	return (
		<div className="mb-[var(--spacing-3)] flex items-start justify-between gap-[var(--spacing-3)]">
			<div className="flex flex-col gap-[var(--spacing-1)]">
				{meta ? (
					<span className="text-micro font-medium tracking-wide text-[var(--color-text-tertiary)]">{meta}</span>
				) : null}
				<h3 className="text-h3 text-[var(--color-text-primary)]">{title}</h3>
			</div>
			{action}
		</div>
	);
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("text-body text-[var(--color-text-secondary)]", className)}>{children}</div>;
}

export function CardFooter({ children }: { children: ReactNode }) {
	return <div className="mt-[var(--spacing-4)] flex flex-wrap items-center gap-[var(--spacing-2)]">{children}</div>;
}
