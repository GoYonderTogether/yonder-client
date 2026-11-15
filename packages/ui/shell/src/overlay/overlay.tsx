import { cn } from "@yonder/ui-components";
import { ChevronLeft, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import { useChromeSize } from "../layout/use-chrome-size.ts";
import { GesturePanel } from "../navigation/gesture-panel.tsx";
import { useDismiss } from "../navigation/use-dismiss.ts";
import type { LayoutMode } from "../responsive/layout-mode.ts";

export interface OverlayProps {
	open: boolean;
	onClose: () => void;
	title: string;
	mode: LayoutMode;
	children: ReactNode;
	wide?: boolean;
	closeLabel?: string;
	mobileBackLabel?: string;
	mobilePresentation?: "page" | "sheet";
}

/** Dialogs retain desktop geometry; constrained windows share the right-hand navigation surface. */
export function Overlay({
	open,
	onClose,
	title,
	mode,
	children,
	wide = false,
	closeLabel = "close",
	mobileBackLabel,
	mobilePresentation = "page",
}: OverlayProps) {
	const centered = mode === "wide" || (mode !== "mobile" && mobilePresentation === "sheet");
	const sheet = !centered && mobilePresentation === "sheet";
	const header = useChromeSize("--frame-header-height", open && !centered);
	useDismiss(open && centered, onClose, 20);
	return (
		<AnimatePresence>
			{open ? (
				<div className="fixed inset-0 z-50 flex" role="presentation">
					<button
						type="button"
						aria-label={closeLabel}
						onClick={onClose}
						className="absolute inset-0 bg-[var(--color-bg-overlay)]"
						tabIndex={-1}
					/>
					<GesturePanel
						open
						inline={centered}
						onBack={onClose}
						layerKey={`action:${title}`}
						label={title}
						modal
						priority={20}
						side={sheet ? "bottom" : "right"}
						className={cn(
							"z-10 bg-[var(--color-bg-surface)]",
							centered
								? cn(
										"m-auto !flex-none max-h-[85dvh] overflow-hidden rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)]",
										wide ? "w-[min(880px,90vw)]" : "w-[min(560px,90vw)]",
									)
								: sheet
									? "!top-auto bottom-0 max-h-[85dvh] w-full rounded-t-[var(--radius-xl)] pb-[var(--safe-area-bottom,env(safe-area-inset-bottom))]"
									: "h-full w-full",
						)}
					>
						{sheet ? (
							<div
								data-sheet-handle
								aria-hidden
								className="flex shrink-0 touch-none justify-center py-[var(--spacing-3)]"
							>
								<span className="h-[var(--spacing-1)] w-[var(--spacing-8)] rounded-full bg-[var(--color-border-subtle)]" />
							</div>
						) : null}
						<div
							data-native-sheet={sheet || undefined}
							data-shell-frame={centered ? undefined : true}
							className="relative flex min-h-0 flex-1 flex-col"
						>
							<div
								ref={header}
								data-frame-header={centered ? undefined : true}
								className="relative flex shrink-0 items-center justify-between border-b border-[var(--color-border-subtle)] px-[var(--spacing-5)] py-[var(--spacing-4)]"
								style={
									centered || sheet
										? undefined
										: { paddingTop: "calc(var(--safe-area-top, env(safe-area-inset-top)) + var(--spacing-4))" }
								}
							>
								<h2
									className={cn(
										"text-h3 text-[var(--color-text-primary)]",
										!centered && mobileBackLabel && "w-full px-[var(--spacing-8)] text-center",
									)}
								>
									{title}
								</h2>
								<button
									type="button"
									onClick={onClose}
									aria-label={!centered && mobileBackLabel ? mobileBackLabel : closeLabel}
									className={cn(
										"rounded-[var(--radius-sm)] p-[var(--spacing-1)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]",
										!centered &&
											mobileBackLabel &&
											"absolute left-[max(var(--spacing-4),var(--safe-area-left,0px))] inline-flex size-[var(--control-md)] items-center justify-center",
									)}
								>
									{!centered && mobileBackLabel ? (
										<ChevronLeft size={24} aria-hidden="true" />
									) : (
										<X size={18} aria-hidden="true" />
									)}
								</button>
							</div>
							<div
								data-frame-scroll={centered ? undefined : true}
								className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
							>
								{children}
							</div>
						</div>
					</GesturePanel>
				</div>
			) : null}
		</AnimatePresence>
	);
}
