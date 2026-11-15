import { cn, IconButton } from "@yonder/ui-components";
import { ChevronLeft, PanelLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { TabId } from "../navigation/routes.ts";
import { useDismiss } from "../navigation/use-dismiss.ts";
import type { LayoutMode } from "../responsive/layout-mode.ts";
import { LIST_PANE_DEFAULT, LIST_PANE_MAX, LIST_PANE_MIN } from "../responsive/layout-mode.ts";
import { useLayoutMode } from "../responsive/use-layout-mode.ts";
import { useVisualViewport } from "../responsive/use-visual-viewport.ts";
import { MobileDock } from "./mobile-dock.tsx";
import { PaneSplitter } from "./pane-splitter.tsx";
import { Rail } from "./rail.tsx";
import { ShellProvider } from "./shell-context.tsx";

export interface ShellTab {
	current: TabId;
	onSelect: (tab: TabId) => void;
	labels: Record<TabId, string>;
	ariaLabel: string;
}

export interface AppShellProps {
	tab: ShellTab;
	renderAvatar: (size: 24 | 28 | 32) => ReactNode;
	personName: string;
	meLabel: string;
	onOpenMe: () => void;
	meOpen: boolean;
	onBack: () => void;
	backLabel: string;
	mobileShowList?: boolean;
	list: ReactNode | null;
	content: ReactNode;
	detailOpen: boolean;
	composer: ReactNode | null;
	titlebarInset: boolean;
	brand: ReactNode;
	labels: { showList: string; hideList: string; resizeList: string };
	locationKey: string;
	onModeChange?: (mode: LayoutMode) => void;
}

/** Responsive shell: rail/list/content on desktop, one pushed screen and dock on a phone. */
export function AppShell({
	tab,
	renderAvatar,
	personName,
	meLabel,
	onOpenMe,
	meOpen,
	onBack,
	backLabel,
	mobileShowList,
	list,
	content,
	detailOpen,
	composer,
	titlebarInset,
	labels,
	locationKey,
	onModeChange,
}: AppShellProps) {
	const container = useRef<HTMLDivElement>(null);
	const mode = useLayoutMode(container);
	const [listWidth, setListWidth] = useState(LIST_PANE_DEFAULT);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const scrollPositions = useRef<Record<string, number>>({});
	const wide = mode === "wide";
	const phone = mode === "mobile";
	useVisualViewport(container, phone);

	useEffect(() => onModeChange?.(mode), [mode, onModeChange]);
	// Entering the me root on a medium window reveals its otherwise hidden list.
	// biome-ignore lint/correctness/useExhaustiveDependencies: navigation is the trigger.
	useEffect(
		() => setDrawerOpen(!phone && !wide && meOpen && Boolean(mobileShowList)),
		[locationKey, phone, wide, meOpen, mobileShowList],
	);
	useDismiss(detailOpen && !drawerOpen, onBack);
	useDismiss(drawerOpen, () => setDrawerOpen(false), 1);

	const backButton = (
		<IconButton aria-label={backLabel} size="sm" onClick={onBack}>
			<ChevronLeft size={24} strokeWidth={1.8} aria-hidden="true" />
		</IconButton>
	);
	const mobileLeft = detailOpen ? (
		backButton
	) : (
		<button
			type="button"
			aria-label={meLabel}
			onClick={onOpenMe}
			className="flex min-h-11 min-w-0 items-center gap-[var(--spacing-2)] rounded-[var(--radius-sm)] text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
		>
			<span className="shrink-0">{renderAvatar(28)}</span>
			<span className="truncate text-body font-semibold">{personName}</span>
		</button>
	);
	const backInList = meOpen && wide && mobileShowList;
	const desktopLeft = (
		<div className="flex items-center gap-[var(--spacing-1)]">
			{/* Wide: the list sits beside the detail, so the open row is the way back — no back button,
			    like Feishu and WeChat desktop. Medium hides the list, so the detail needs one. */}
			{detailOpen && !wide ? backButton : null}
			{list && !wide ? (
				<IconButton aria-label={labels.showList} size="sm" onClick={() => setDrawerOpen(true)}>
					<PanelLeft size={18} aria-hidden="true" />
				</IconButton>
			) : null}
		</div>
	);
	const listChrome = {
		mode,
		left: phone ? mobileLeft : backInList ? backButton : null,
		meOpen,
		scroll: { key: meOpen ? "me" : tab.current, positions: scrollPositions },
	};
	const contentChrome = { mode, left: phone ? mobileLeft : desktopLeft, meOpen };

	return (
		<div
			ref={container}
			className="relative h-[var(--app-height,100dvh)] w-full overflow-hidden"
			style={{ top: "var(--app-offset-top, 0px)" }}
		>
			<div className={cn("flex h-full w-full", phone ? "bg-[var(--color-bg-base)]" : "bg-[var(--color-bg-chrome)]")}>
				{!phone ? (
					<Rail
						current={tab.current}
						onSelect={tab.onSelect}
						labels={tab.labels}
						ariaLabel={tab.ariaLabel}
						renderAvatar={renderAvatar}
						onOpenMe={onOpenMe}
						meOpen={meOpen}
						meLabel={meLabel}
						titlebarInset={titlebarInset}
					/>
				) : null}

				{list && wide ? (
					<aside
						className="relative flex h-full shrink-0 flex-col bg-[var(--color-bg-chrome)]"
						style={{ width: listWidth }}
					>
						<ShellProvider value={listChrome}>{list}</ShellProvider>
						<PaneSplitter
							width={listWidth}
							min={LIST_PANE_MIN}
							max={LIST_PANE_MAX}
							onResize={setListWidth}
							label={labels.resizeList}
						/>
					</aside>
				) : null}

				<main className={cn("relative flex min-w-0 flex-1 flex-col", !phone && "pb-[6px] pe-[6px]")}>
					<div
						className={cn(
							"relative flex min-h-0 flex-1 flex-col",
							!phone &&
								"overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-bg-base)] shadow-[var(--shadow-xs)]",
						)}
					>
						<ShellProvider value={phone && (mobileShowList ?? !detailOpen) && list ? listChrome : contentChrome}>
							<div
								key={detailOpen ? "detail" : "root"}
								className={cn("flex min-h-0 flex-1 flex-col", phone && detailOpen && "animate-push-in")}
							>
								{phone && (mobileShowList ?? !detailOpen) && list ? list : content}
							</div>
						</ShellProvider>
						{!phone && composer ? (
							<div className="shrink-0 px-[var(--spacing-5)] pb-[var(--spacing-4)]">
								<div className="mx-auto w-full max-w-[760px]">{composer}</div>
							</div>
						) : null}

						{list && !phone && !wide && drawerOpen ? (
							<div className="absolute inset-0 z-30 flex">
								<button
									type="button"
									aria-label={labels.hideList}
									className="absolute inset-0 animate-fade-in bg-[var(--color-bg-overlay)]"
									onClick={() => setDrawerOpen(false)}
									tabIndex={-1}
								/>
								<aside
									className="relative flex h-full w-[320px] max-w-[85%] animate-drawer-in flex-col bg-[var(--color-bg-chrome)] shadow-[var(--shadow-lg)]"
									aria-label={labels.showList}
								>
									<ShellProvider value={listChrome}>{list}</ShellProvider>
								</aside>
							</div>
						) : null}
					</div>
					{phone ? (
						<MobileDock
							composer={composer}
							showTabs={!detailOpen}
							current={tab.current}
							onSelect={tab.onSelect}
							labels={tab.labels}
							ariaLabel={tab.ariaLabel}
						/>
					) : null}
				</main>
			</div>
		</div>
	);
}
