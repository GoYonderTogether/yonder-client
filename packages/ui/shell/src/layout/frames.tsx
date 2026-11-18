import { cn } from "@yonder/ui-components";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";
import { useShellChrome } from "./shell-context.tsx";
import { TopBar } from "./top-bar.tsx";
import { useChromeSize } from "./use-chrome-size.ts";

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
	const header = useChromeSize("--frame-header-height");
	return (
		<div data-shell-frame className="relative flex min-h-0 flex-1 flex-col">
			<div ref={header} data-frame-header className="shrink-0">
				<TopBar
					left={
						meOpen ? (
							left
						) : (
							<div className="flex min-w-0 items-center gap-[var(--spacing-3)]">
								{left}
								{title ? (
									<h1 className="truncate text-h3 font-semibold text-[var(--color-text-primary)]">{title}</h1>
								) : null}
							</div>
						)
					}
					center={meOpen ? title : null}
					right={action}
					phone={phone}
				/>
				{center ? (
					<div className="flex shrink-0 justify-center px-[var(--spacing-4)] pb-[var(--spacing-3)] [&>[role=radiogroup]]:h-auto [&>[role=radiogroup]]:w-full [&>[role=radiogroup]]:rounded-[var(--radius-full)] [&_label]:min-h-[calc(var(--control-lg)-var(--spacing-1))] [&_label]:flex-1 [&_label]:rounded-[var(--radius-full)] [&_label]:text-body [&_label>span]:w-full [&_label>span]:justify-center [&_label>span]:rounded-[var(--radius-full)]">
						{center}
					</div>
				) : null}
			</div>
			<div
				data-frame-scroll
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

/** Which column width a page uses; values are the `--width-*` tokens (docs/design-system.md). */
export type PageWidth = "form" | "sheet" | "reading" | "wide" | "full";

const PAGE_WIDTHS: Record<PageWidth, string | false> = {
	form: "mx-auto max-w-[var(--width-form)]",
	sheet: "mx-auto max-w-[var(--width-sheet)]",
	reading: "mx-auto max-w-[var(--width-reading)]",
	wide: "mx-auto max-w-[var(--width-wide)]",
	full: false,
};

export interface PageFrameProps {
	title?: ReactNode;
	action?: ReactNode;
	children: ReactNode;
	/** form 400 (auth, setup), sheet 560, reading 680 (default: settings, details), wide 880, full. */
	width?: PageWidth;
	scroll?: boolean;
}

/**
 * The detail-layer page: one TopBar and a padded, centred column. Padding is `--page-padding`, so
 * density changes it: 16 on a phone, 24 above and below on a desktop, and one spacing step more at
 * the sides so the column lines up with the TopBar's title.
 */
export function PageFrame({ title, action, children, width = "reading", scroll = true }: PageFrameProps) {
	const { mode, left } = useShellChrome();
	const phone = mode === "mobile";
	const header = useChromeSize("--frame-header-height");
	return (
		<div data-shell-frame className="relative flex min-h-0 flex-1 flex-col">
			<div ref={header} data-frame-header className="shrink-0">
				<TopBar left={left} center={title} right={action} phone={phone} />
			</div>
			<div
				data-frame-scroll
				className={cn("flex min-h-0 flex-1 flex-col", scroll && "overflow-y-auto overscroll-contain")}
			>
				<div
					className={cn(
						"flex w-full flex-1 flex-col",
						PAGE_WIDTHS[width],
						"py-[var(--page-padding)]",
						phone ? "px-[var(--page-padding)]" : "px-[calc(var(--page-padding)+var(--spacing-2))]",
					)}
				>
					{children}
				</div>
			</div>
		</div>
	);
}
