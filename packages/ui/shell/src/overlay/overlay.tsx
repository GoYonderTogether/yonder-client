import { cn } from "@yonder/ui-components";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useDismiss } from "../navigation/use-dismiss.ts";
import type { LayoutMode } from "../responsive/layout-mode.ts";

export interface OverlayProps {
	open: boolean;
	onClose: () => void;
	/** Shown as the dialog title, and what screen readers announce. */
	title: string;
	mode: LayoutMode;
	children: ReactNode;
	/** A wide overlay for a two-column list (「我」); a narrow one for a single question. */
	wide?: boolean;
}

/**
 * Layer three. On desktop a centred dialog; on a phone a bottom sheet (11 第四节第 3 条). Esc, a
 * click outside, and the close button all go through `onClose`, which is the same exit the router
 * uses — one meaning of "back" everywhere.
 */
export function Overlay({ open, onClose, title, mode, children, wide = false }: OverlayProps) {
	const panel = useRef<HTMLDivElement>(null);
	const previouslyFocused = useRef<HTMLElement | null>(null);

	useDismiss(open, onClose, 2);

	// Focus goes in when it opens and back to the trigger when it closes (10-质量 第二节).
	useEffect(() => {
		if (!open) return;
		previouslyFocused.current = document.activeElement as HTMLElement | null;
		const first = panel.current?.querySelector<HTMLElement>(
			"button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
		);
		first?.focus();
		return () => previouslyFocused.current?.focus();
	}, [open]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex" role="presentation">
			<button
				type="button"
				aria-label="close"
				onClick={onClose}
				className="absolute inset-0 bg-[var(--color-bg-overlay)]"
				tabIndex={-1}
			/>
			<div
				ref={panel}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className={cn(
					"relative z-10 flex max-h-full flex-col overflow-hidden bg-[var(--color-bg-surface)]",
					mode === "mobile"
						? "mt-auto max-h-[92dvh] w-full rounded-t-[var(--radius-xl)]"
						: cn(
								"m-auto max-h-[85dvh] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)]",
								wide ? "w-[min(880px,90vw)]" : "w-[min(560px,90vw)]",
							),
				)}
			>
				<div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-[var(--spacing-5)] py-[var(--spacing-4)]">
					<h2 className="text-h3 text-[var(--color-text-primary)]">{title}</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label="close"
						className="rounded-[var(--radius-sm)] p-[var(--spacing-1)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
					>
						<X size={18} aria-hidden="true" />
					</button>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
			</div>
		</div>
	);
}
