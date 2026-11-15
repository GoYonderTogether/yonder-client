import { cn } from "@yonder/ui-components";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import { useShellChrome } from "./shell-context.tsx";
import { TopBar } from "./top-bar.tsx";

/** Shared list and detail wrappers. Pages provide only the top bar's center and right slots. */
export function ListFrame({
	title,
	center,
	action,
	children,
}: {
	title?: string;
	center?: ReactNode;
	action?: ReactNode;
	children: ReactNode;
}) {
	const { mode, left, meOpen, scroll } = useShellChrome();
	const scrollRef = useRef<HTMLDivElement>(null);
	const scrollKey = scroll?.key;
	const positions = scroll?.positions;
	useLayoutEffect(() => {
		if (scrollRef.current && positions && scrollKey) {
			scrollRef.current.scrollTop = positions.current[scrollKey] ?? 0;
		}
	}, [positions, scrollKey]);
	const phone = mode === "mobile";
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<TopBar left={left} center={center ?? (meOpen ? title : null)} right={action} phone={phone} />
			<div
				ref={scrollRef}
				onScroll={(event) => {
					if (scroll) scroll.positions.current[scroll.key] = event.currentTarget.scrollTop;
				}}
				className={cn(
					"min-h-0 flex-1 overflow-y-auto overscroll-contain",
					phone ? "px-[var(--spacing-4)] pb-[var(--spacing-6)]" : "px-[var(--spacing-2)] pb-[var(--spacing-4)]",
				)}
			>
				{children}
			</div>
		</div>
	);
}

export function PageFrame({
	title,
	action,
	children,
	width = "reading",
	scroll = true,
}: {
	title?: ReactNode;
	action?: ReactNode;
	children: ReactNode;
	width?: "reading" | "full";
	scroll?: boolean;
}) {
	const { mode, left } = useShellChrome();
	const phone = mode === "mobile";
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<TopBar left={left} center={title} right={action} phone={phone} />
			<div className={cn("flex min-h-0 flex-1 flex-col", scroll && "overflow-y-auto overscroll-contain")}>
				<div
					className={cn(
						"flex w-full flex-1 flex-col",
						width === "reading" && "mx-auto max-w-[680px]",
						phone ? "px-[var(--spacing-4)] py-[var(--spacing-4)]" : "px-[var(--spacing-8)] py-[var(--spacing-6)]",
					)}
				>
					{children}
				</div>
			</div>
		</div>
	);
}
