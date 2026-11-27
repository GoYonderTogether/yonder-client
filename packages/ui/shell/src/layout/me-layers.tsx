import { cn, IconButton } from "@yonder/ui-components";
import { X } from "lucide-react";
import { AnimatePresence, useIsPresent } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { GesturePanel } from "../navigation/gesture-panel.tsx";
import { useDismiss } from "../navigation/use-dismiss.ts";
import { OverlayBackdrop } from "../overlay/overlay-backdrop.tsx";
import type { LayoutMode } from "../responsive/layout-mode.ts";
import type { MeStack } from "./app-shell.tsx";
import { workspaceCardInset, workspaceCardSurface } from "./frames.tsx";
import { ShellProvider } from "./shell-context.tsx";

export function MeLayers({
	me,
	mode,
	desktop,
	titlebarInset,
	statusVisible,
	onBack,
	backButton,
	label,
	scrollPositions,
	covered,
	sideWidth,
	detailAction,
}: {
	me: MeStack;
	mode: LayoutMode;
	desktop: boolean;
	titlebarInset: boolean;
	statusVisible: boolean;
	onBack: () => void;
	backButton: ReactNode;
	label: string;
	scrollPositions: React.RefObject<Record<string, number>>;
	covered: boolean;
	sideWidth: number;
	detailAction: ReactNode;
}) {
	const wide = mode === "wide";
	const floating = desktop && wide;
	const docked = floating && sideWidth > 0;
	const settingsMode = desktop && !wide ? "mobile" : mode;
	const hasPage = me.pages.length > 0;
	const present = useIsPresent();
	const entering = useRef(true);
	useEffect(() => {
		entering.current = false;
	}, []);
	useDismiss(floating && present && !covered && !sideWidth, me.onClose, 10);
	const panel = (
		<GesturePanel
			open
			inline={floating}
			active={!covered && (!desktop || present)}
			side="left"
			layerKey="me"
			onBack={me.onClose}
			label={label}
			modal={!sideWidth && (mode === "mobile" || (desktop && !statusVisible))}
			role={!sideWidth && (desktop || mode === "mobile") ? "dialog" : "region"}
			priority={10}
			className={cn(
				docked
					? "z-10 h-full w-full"
					: floating
						? "z-10 h-full max-h-[var(--settings-window-height)] w-full max-w-[var(--settings-window-width)] overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-bg-base)] shadow-[var(--shadow-lg)] motion-safe:animate-pop-in"
						: "z-20",
				!desktop && mode !== "mobile" && "start-[var(--rail-width)]",
				desktop && !wide && titlebarInset && "[--topbar-padding-start:calc(var(--spacing-3)+var(--rail-width))]",
			)}
		>
			<div className={cn("relative flex min-h-0 flex-1", docked && "gap-[var(--spacing-2)]")}>
				<div
					inert={!wide && hasPage}
					aria-hidden={(!wide && hasPage) || undefined}
					data-surface="chrome"
					className={cn(
						"yonder-chrome flex min-h-0 shrink-0 flex-col",
						docked
							? "w-[min(var(--list-pane-default,320px),40%)]"
							: wide
								? "w-[var(--list-pane-default,320px)]"
								: "w-full",
					)}
				>
					<ShellProvider
						value={{
							mode: settingsMode,
							desktop,
							// The phone's 「我」 enters from the left, so it leaves to the left: one round close at the
							// trailing edge and nothing at the leading one. The back arrow belongs to the pages pushed on it.
							left:
								(wide && !desktop) || settingsMode === "mobile" ? null : (
									<IconButton aria-label={me.closeLabel} size="sm" onClick={me.onClose}>
										<X size={20} aria-hidden="true" />
									</IconButton>
								),
							right:
								settingsMode === "mobile" ? (
									<IconButton
										aria-label={me.closeLabel}
										size="sm"
										variant="secondary"
										className="rounded-[var(--radius-full)]"
										onClick={me.onClose}
									>
										<X size={18} strokeWidth={2} aria-hidden="true" />
									</IconButton>
								) : undefined,
							meOpen: true,
							scroll: { key: "me", positions: scrollPositions },
						}}
					>
						{me.list}
					</ShellProvider>
				</div>
				<div
					data-me-content-card={docked || undefined}
					className={cn(
						"min-h-0 min-w-0 flex-1",
						wide ? "relative" : "absolute inset-0",
						docked && workspaceCardSurface,
						!hasPage && "pointer-events-none",
					)}
				>
					<AnimatePresence>
						{me.pages.map((page, index) => (
							<GesturePanel
								key={page.key}
								open
								initial={!entering.current}
								active={present && !covered && index === me.pages.length - 1}
								layerKey={page.key}
								onBack={onBack}
								priority={11 + index}
								label={label}
							>
								<ShellProvider
									value={{
										mode: settingsMode,
										desktop,
										left: wide && index === 0 ? null : backButton,
										detailAction: index === me.pages.length - 1 ? detailAction : null,
										meOpen: true,
									}}
								>
									{page.content}
								</ShellProvider>
							</GesturePanel>
						))}
					</AnimatePresence>
				</div>
			</div>
		</GesturePanel>
	);
	return (
		<div
			data-me-layers
			data-me-docked={docked || undefined}
			inert={!present || covered}
			style={docked ? { insetInlineStart: "var(--rail-width)", insetInlineEnd: sideWidth } : undefined}
			className={cn(
				docked
					? cn("yonder-chrome absolute inset-0 z-20 flex", workspaceCardInset)
					: floating
						? "absolute inset-0 z-20 grid place-items-center px-[max(var(--spacing-4),5vw)]"
						: "contents",
				floating &&
					!docked &&
					(titlebarInset ? "py-[max(var(--titlebar-height),5dvh)]" : "py-[max(var(--spacing-6),5dvh)]"),
			)}
		>
			{floating && !docked ? <OverlayBackdrop onClose={me.onClose} /> : null}
			{panel}
		</div>
	);
}
