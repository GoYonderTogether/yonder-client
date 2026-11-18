import { cn } from "@yonder/ui-components";
import type { ReactNode } from "react";

/** Shared column header; only its empty space is a window drag region. */
export function TopBar({
	left,
	center,
	right,
	titleAlign = "center",
	phone = false,
}: {
	left?: ReactNode;
	center?: ReactNode;
	right?: ReactNode;
	titleAlign?: "start" | "center";
	phone?: boolean;
}) {
	const start = titleAlign === "start";
	const title =
		typeof center === "string" || typeof center === "number" ? <span className="truncate">{center}</span> : center;
	const titleStyle = "flex min-w-0 items-center text-h3 font-semibold text-[var(--color-text-primary)]";
	return (
		<header
			data-shell-topbar
			data-tauri-drag-region
			className="shrink-0"
			style={phone ? { paddingTop: "var(--safe-area-top, env(safe-area-inset-top))" } : undefined}
		>
			<div
				data-tauri-drag-region
				className={cn(
					"grid h-[var(--titlebar-height)] items-center ps-[var(--topbar-padding-start,var(--spacing-3))] pe-[var(--spacing-3)]",
					start
						? "grid-cols-[minmax(0,1fr)_auto] gap-[var(--spacing-2)]"
						: "grid-cols-[minmax(var(--control-md),1fr)_minmax(0,auto)_minmax(var(--control-md),1fr)]",
				)}
			>
				<div
					data-tauri-drag-region
					className={cn("flex min-w-0 items-center justify-start", start && "gap-[var(--spacing-2)]")}
				>
					{left}
					{start && title ? (
						<div data-tauri-drag-region className={titleStyle}>
							{title}
						</div>
					) : null}
				</div>
				{start ? null : (
					<div data-tauri-drag-region className={cn(titleStyle, "justify-center text-center")}>
						{title}
					</div>
				)}
				<div data-tauri-drag-region className="flex min-w-0 items-center justify-end">
					{right}
				</div>
			</div>
		</header>
	);
}
