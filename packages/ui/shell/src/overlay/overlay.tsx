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
	footer?: ReactNode;
	size?: "small" | "wide";
	closeLabel?: string;
	mobileBackLabel?: string;
	mobilePresentation?: "page" | "sheet" | "tall-sheet" | "large-sheet";
	onExpand?: () => void;
	expandLabel?: string;
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
	footer,
	size,
	closeLabel = "close",
	mobileBackLabel,
	mobilePresentation = "page",
	onExpand,
	expandLabel,
}: OverlayProps) {
	const { desktop } = useShellChrome();
	const centered = mode === "wide" || (mode !== "mobile" && mobilePresentation !== "page");
	const square = desktop && centered;
	const sheet = !centered && mobilePresentation !== "page";
	const tallSheet = sheet && mobilePresentation === "tall-sheet";
	const expandable = tallSheet && Boolean(onExpand);
	const viewport = useRef<HTMLDivElement>(null);
	useVisualViewport(viewport, open && sheet);
	const nativeFrame = !centered && !sheet;
	const header = useChromeSize("--frame-header-height", open && nativeFrame);
	useDismiss(open && centered, onClose, 20);
	if (typeof document === "undefined") return null;
	return createPortal(
		<AnimatePresence>
			{open ? (
				<div
					ref={viewport}
					className={cn(
						"pointer-events-none fixed inset-x-0 z-50 flex [--dialog-max-height:85dvh] [&>[aria-modal=true]]:pointer-events-auto [&>[data-overlay-backdrop]]:pointer-events-auto",
						sheet ? "top-[var(--app-offset-top,0px)] h-[var(--app-height,100dvh)]" : "inset-y-0",
						expandable && "overflow-hidden",
					)}
					role="presentation"
				>
					{expandable ? (
						<div aria-hidden className="absolute inset-0 bg-[var(--color-bg-overlay)]" />
					) : (
						<OverlayBackdrop onClose={onClose} closeLabel={closeLabel} />
					)}
					<GesturePanel
						open
						inline={centered}
						onBack={onClose}
						onExpand={expandable ? onExpand : undefined}
						layerKey={`action:${title}`}
						label={title}
						modal
						priority={20}
						side={sheet ? "bottom" : "right"}
						className={cn(
							"z-10",
							sheet && !centered ? "material material-thick" : "bg-[var(--color-bg-surface)]",
							centered
								? cn(
										"m-auto !flex-none max-h-[var(--dialog-max-height)] overflow-hidden rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)]",
										square
											? cn(
													"w-[var(--dialog-size)] min-h-[min(var(--dialog-size),var(--dialog-max-height))] [--dialog-size:min(var(--dialog-width),90vw,max(var(--dialog-width-min),var(--dialog-max-height)))]",
													size === "small" && "[--dialog-width:var(--dialog-width-min)]",
													size === "wide" && "[--dialog-width:var(--dialog-width-wide)]",
												)
											: size === "wide"
												? "w-[min(880px,90vw)]"
												: "w-[min(560px,90vw)]",
									)
								: sheet
									? cn(
											"!top-auto bottom-0 w-full rounded-t-[var(--radius-xl)] pb-[var(--dock-bottom-inset,var(--safe-area-bottom,env(safe-area-inset-bottom)))]",
											tallSheet
												? expandable
													? "h-[min(calc(77dvh+var(--sheet-expansion,0px)),var(--app-height,100dvh))] !overflow-visible"
													: "h-[min(70dvh,var(--app-height,100dvh))]"
												: mobilePresentation === "large-sheet"
													? "h-[min(80dvh,var(--app-height,100dvh))]"
													: "max-h-[min(var(--dialog-max-height),var(--app-height,100dvh))]",
										)
									: "h-full w-full",
						)}
					>
						{expandable ? (
							<>
								<button
									type="button"
									data-overlay-backdrop
									tabIndex={-1}
									aria-label={closeLabel}
									onClick={onClose}
									className="absolute inset-x-0 bottom-full h-[var(--app-height,100dvh)] touch-none"
								/>
								<button
									type="button"
									data-sheet-handle
									aria-label={expandLabel}
									onKeyDown={(event) => {
										if (event.key === "ArrowUp") {
											event.preventDefault();
											event.currentTarget.click();
										} else if (event.key === "ArrowDown") {
											event.preventDefault();
											onClose();
										}
									}}
									className="flex shrink-0 touch-none justify-center py-[var(--spacing-3)]"
								>
									<span className="h-[var(--spacing-1)] w-[var(--spacing-8)] rounded-full bg-[var(--color-border-subtle)]" />
								</button>
							</>
						) : sheet ? (
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
							{!expandable ? (
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
											"min-w-0 text-h3 text-[var(--color-text-primary)] [overflow-wrap:anywhere]",
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
											"shrink-0 rounded-[var(--radius-sm)] p-[var(--spacing-1)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]",
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
							) : null}
							<div
								data-overlay-body
								data-frame-scroll={nativeFrame || undefined}
								className={cn(
									"min-h-0 flex-1",
									tallSheet ? "flex flex-col overflow-hidden" : "overflow-y-auto overscroll-contain",
									square && "flex flex-col [&>*]:shrink-0",
								)}
							>
								{children}
							</div>
							{footer ? (
								<div
									data-overlay-footer
									className={cn(
										"flex shrink-0 flex-wrap justify-end gap-[var(--spacing-3)] border-t border-[var(--color-border-subtle)] px-[var(--spacing-5)] py-[var(--spacing-4)]",
										!centered &&
											"ps-[max(var(--spacing-5),var(--safe-area-left,0px))] pe-[max(var(--spacing-5),var(--safe-area-right,0px))]",
										nativeFrame && "pb-[calc(var(--spacing-4)+var(--safe-area-bottom,env(safe-area-inset-bottom)))]",
									)}
								>
									{footer}
								</div>
							) : null}
						</div>
					</GesturePanel>
				</div>
			) : null}
		</AnimatePresence>,
		document.body,
	);
}
