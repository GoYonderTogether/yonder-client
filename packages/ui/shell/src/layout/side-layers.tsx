import { cn, IconButton } from "@yonder/ui-components";
import { ChevronLeft, X } from "lucide-react";
import { AnimatePresence, useIsPresent } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { GesturePanel } from "../navigation/gesture-panel.tsx";
import type { LayoutMode } from "../responsive/layout-mode.ts";
import { ShellProvider } from "./shell-context.tsx";
import { TopBar } from "./top-bar.tsx";
import { useChromeSize } from "./use-chrome-size.ts";

export interface SidePage {
	key: string;
	title: string;
	content: ReactNode;
}

/**
 * The right-hand side panel: group info, a Bot's detail, someone's card. It is the frame's top
 * layer. Back leaves the top page, then the panel, then the content, then the list, the same order
 * on a phone and a desktop. A page opened from inside the panel (a member from group info) stacks
 * on it and goes back to it.
 */
export interface SideStack {
	pages: readonly SidePage[];
	/** Leaves the top page; leaving the last one closes the panel. */
	onBack: () => void;
	/** Closes the whole panel. */
	onClose: () => void;
	backLabel: string;
	closeLabel: string;
}

/**
 * Escape and the system back reach the topmost layer first. The panel sits above the Me pages
 * (10 and up) and below a dialog opened from inside it (`Overlay`, 20), so a confirmation inside
 * group info closes before group info does.
 */
const SIDE_PRIORITY = 15;

export function SideLayers({ side, mode, desktop }: { side: SideStack; mode: LayoutMode; desktop: boolean }) {
	const present = useIsPresent();
	const entering = useRef(true);
	useEffect(() => {
		entering.current = false;
	}, []);
	const [root, ...stacked] = side.pages;
	if (!root) return null;
	return (
		<>
			{desktop ? (
				<button
					type="button"
					aria-label={side.closeLabel}
					tabIndex={-1}
					onClick={side.onClose}
					data-side-scrim
					className="absolute inset-0 z-40 cursor-default bg-transparent"
				/>
			) : null}
			<GesturePanel
				open
				modal
				layerKey="side"
				onBack={side.onBack}
				label={root.title}
				priority={SIDE_PRIORITY}
				className={cn(
					"z-40",
					desktop &&
						"!left-auto w-[var(--side-panel-width)] max-w-[calc(100%-var(--spacing-8))] border-l border-[var(--color-border-subtle)] shadow-[var(--shadow-lg)]",
				)}
			>
				<div inert={stacked.length > 0} className="flex min-h-0 flex-1 flex-col">
					<SideFrame page={root} mode={mode} desktop={desktop} side={side} depth={0} />
				</div>
				<AnimatePresence>
					{stacked.map((page, index) => (
						<GesturePanel
							key={page.key}
							open
							modal
							initial={!entering.current || index > 0}
							active={present && index === stacked.length - 1}
							layerKey={`side:${page.key}`}
							onBack={side.onBack}
							label={page.title}
							priority={SIDE_PRIORITY + 1 + index}
						>
							<SideFrame page={page} mode={mode} desktop={desktop} side={side} depth={index + 1} />
						</GesturePanel>
					))}
				</AnimatePresence>
			</GesturePanel>
		</>
	);
}

function SideFrame({
	page,
	mode,
	desktop,
	side,
	depth,
}: {
	page: SidePage;
	mode: LayoutMode;
	desktop: boolean;
	side: SideStack;
	depth: number;
}) {
	const header = useChromeSize("--frame-header-height");
	// A covering page goes back like any other page; the drawer's root page closes with ×.
	const back =
		depth > 0 || !desktop ? (
			<IconButton aria-label={side.backLabel} size="sm" onClick={side.onBack}>
				<ChevronLeft size={24} strokeWidth={1.8} aria-hidden="true" />
			</IconButton>
		) : null;
	const close = desktop ? (
		<IconButton aria-label={side.closeLabel} size="sm" onClick={side.onClose}>
			<X size={20} aria-hidden="true" />
		</IconButton>
	) : null;
	return (
		<div data-shell-frame className="relative flex min-h-0 flex-1 flex-col">
			<div ref={header} data-frame-header className="shrink-0">
				<TopBar left={back} center={page.title} right={close} phone={!desktop} />
			</div>
			<div data-frame-scroll className="min-h-0 flex-1 touch-pan-y touch-pinch-zoom overflow-y-auto overscroll-contain">
				<ShellProvider value={{ mode, desktop, left: null, meOpen: false }}>{page.content}</ShellProvider>
			</div>
		</div>
	);
}
