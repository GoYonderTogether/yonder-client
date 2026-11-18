import { cn } from "@yonder/ui-components";
import { ChevronLeft, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { type ReactNode, useRef } from "react";
import { createPortal } from "react-dom";
import { useShellChrome } from "../layout/shell-context.tsx";
import { useChromeSize } from "../layout/use-chrome-size.ts";
import { GesturePanel } from "../navigation/gesture-panel.tsx";
import { useDismiss } from "../navigation/use-dismiss.ts";
import type { LayoutMode } from "../responsive/layout-mode.ts";
import { useVisualViewport } from "../responsive/use-visual-viewport.ts";
import { OverlayBackdrop } from "./overlay-backdrop.tsx";

export interface OverlayProps {
	open: boolean;
	onClose: () => void;
	title: string;
	mode: LayoutMode;
	children: ReactNode;
	size?: "small" | "wide";
	closeLabel?: string;
	mobileBackLabel?: string;
	mobilePresentation?: "page" | "sheet" | "tall-sheet";
}

/**
 * Dialogs retain desktop geometry; constrained windows share the right-hand navigation surface.
 * Rendered into `document.body`: a dialog opened from inside the side panel or a sliding page must
 * not be clipped by, or positioned against, that panel's transform.
 */
export function Overlay({
	open,
	onClose,
	title,
	mode,
	children,
	size,
	closeLabel = "close",
	mobileBackLabel,
	mobilePresentation = "page",
}: OverlayProps) {
	const { desktop } = useShellChrome();
	const centered = mode === "wide" || (mode !== "mobile" && mobilePresentation !== "page");
	const square = desktop && centered;
	const sheet = !centered && mobilePresentation !== "page";
	const tallSheet = sheet && mobilePresentation === "tall-sheet";
	const viewport = useRef<HTMLDivElement>(null);
	useVisualViewport(viewport, open && tallSheet);
	const nativeFrame = !centered && !tallSheet;
	const header = useChromeSize("--frame-header-height", open && nativeFrame);
	useDismiss(open && centered, onClose, 20);
	if (typeof document === "undefined") return null;
	return createPortal(
		<AnimatePresence>
			{open ? (
				<div
					ref={viewport}
					className={cn(
						"fixed inset-x-0 z-50 flex",
						tallSheet ? "top-[var(--app-offset-top,0px)] h-[var(--app-height,100dvh)]" : "inset-y-0",
					)}
					role="presentation"
				>
					<OverlayBackdrop onClose={onClose} closeLabel={closeLabel} />
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
										square
											? cn(
													"w-[var(--dialog-size)] min-h-[min(var(--dialog-size),85dvh)] [--dialog-size:min(var(--dialog-width),90vw,max(var(--dialog-width-min),85dvh))]",
													size === "small" && "[--dialog-width:var(--dialog-width-min)]",
													size === "wide" && "[--dialog-width:var(--dialog-width-wide)]",
												)
											: size === "wide"
												? "w-[min(880px,90vw)]"
												: "w-[min(560px,90vw)]",
									)
								: sheet
									? cn(
											"!top-auto bottom-0 w-full rounded-t-[var(--radius-xl)]",
											tallSheet
												? "h-[min(70dvh,var(--app-height,100dvh))] pb-[var(--dock-bottom-inset,env(safe-area-inset-bottom))]"
												: "max-h-[85dvh] pb-[var(--safe-area-bottom,env(safe-area-inset-bottom))]",
										)
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
							data-shell-frame={nativeFrame || undefined}
							className="relative flex min-h-0 flex-1 flex-col"
						>
							<div
								ref={header}
								data-frame-header={nativeFrame || undefined}
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
								data-frame-scroll={nativeFrame || undefined}
								className={cn(
									"min-h-0 flex-1",
									tallSheet ? "flex flex-col overflow-hidden" : "overflow-y-auto overscroll-contain",
									square && "flex flex-col [&>*]:shrink-0",
								)}
							>
								{children}
							</div>
						</div>
					</GesturePanel>
				</div>
			) : null}
		</AnimatePresence>,
		document.body,
	);
}
