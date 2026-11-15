import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "../button/button.tsx";
import { cn } from "../cn.ts";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
	"aria-label": string;
	children: ReactNode;
	variant?: "ghost" | "secondary";
	size?: "sm" | "md";
}

/** The invisible extension gives the visual 32/40px control a 44px hit target. */
export function IconButton({ children, size = "md", variant = "ghost", className, ...props }: IconButtonProps) {
	return (
		<Button
			{...props}
			variant={variant}
			size={size}
			className={cn(
				size === "sm" ? "w-[var(--control-sm)] after:-inset-[6px]" : "w-[var(--control-md)] after:-inset-[2px]",
				"px-0! after:absolute after:content-['']",
				className,
			)}
		>
			{children}
		</Button>
	);
}
