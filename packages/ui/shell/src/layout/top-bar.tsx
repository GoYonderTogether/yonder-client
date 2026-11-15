import type { ReactNode } from "react";

/** Shared column header; only its empty space is a window drag region. */
export function TopBar({
	left,
	center,
	right,
	phone = false,
}: {
	left?: ReactNode;
	center?: ReactNode;
	right?: ReactNode;
	phone?: boolean;
}) {
	return (
		<header
			data-tauri-drag-region
			className="shrink-0"
			style={phone ? { paddingTop: "env(safe-area-inset-top)" } : undefined}
		>
			<div
				data-tauri-drag-region
				className="grid h-[var(--titlebar-height)] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-[var(--spacing-3)]"
			>
				<div data-tauri-drag-region className="flex min-w-0 items-center justify-start">
					{left}
				</div>
				<div
					data-tauri-drag-region
					className="min-w-0 text-center text-h3 font-semibold text-[var(--color-text-primary)]"
				>
					{center}
				</div>
				<div data-tauri-drag-region className="flex min-w-0 items-center justify-end">
					{right}
				</div>
			</div>
		</header>
	);
}
