import { cn, IconButton } from "@yonder/ui-components";
import { ChevronLeft, Settings, X } from "lucide-react";
import { AnimatePresence, useIsPresent } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { GesturePanel } from "../navigation/gesture-panel.tsx";
import type { TabId } from "../navigation/routes.ts";
import { useDismiss } from "../navigation/use-dismiss.ts";
import { OverlayBackdrop } from "../overlay/overlay-backdrop.tsx";
import type { LayoutMode } from "../responsive/layout-mode.ts";
import { LIST_PANE_MIN } from "../responsive/layout-mode.ts";
import { useLayoutMode } from "../responsive/use-layout-mode.ts";
import { useVisualViewport } from "../responsive/use-visual-viewport.ts";
import type { MobileDockProps } from "./mobile-dock.tsx";
import { MobileDock } from "./mobile-dock.tsx";
import { PaneSplitter } from "./pane-splitter.tsx";
import { Rail } from "./rail.tsx";
import { ShellProvider } from "./shell-context.tsx";
import type { SideStack } from "./side-layers.tsx";
import { SideLayers } from "./side-layers.tsx";
import { useChromeSize } from "./use-chrome-size.ts";
import { usePaneLayout } from "./use-pane-layout.ts";

export interface ShellTab {
	current: TabId;
	onSelect: (tab: TabId) => void;
	labels: Record<TabId, string>;
	ariaLabel: string;
	mobileBot?: MobileDockProps["botTab"];
}

export interface MeStack {
	list: ReactNode;
	pages: readonly { key: string; content: ReactNode }[];
	onClose: () => void;
	closeLabel: string;
}

export interface AppShellProps {
	tab: ShellTab;
	renderAvatar: (size: 24 | 28 | 32) => ReactNode;
	personName: string;
	meLabel: string;
	settingsLabel: string;
	updateAction?: ReactNode;
	onOpenContacts?: (() => void) | undefined;
	contactsLabel?: string | undefined;
	onOpenMe: () => void;
	meOpen: boolean;
	me?: MeStack | undefined;
	/** The right-hand side panel; the frame's top layer while it has a page. */
	side?: SideStack | undefined;
	desktop?: boolean;
	onBack: () => void;
	backLabel: string;
	mobileShowList?: boolean;
	list: ReactNode | null;
	content: ReactNode;
	detailOpen: boolean;
	composer: ReactNode | null;
	status?: ReactNode;
	titlebarInset: boolean;
	brand: ReactNode;
	labels: { showList: string; hideList: string; resizeList: string };
	locationKey: string;
	onModeChange?: (mode: LayoutMode) => void;
}

/** Host chrome stays stable while the same list and detail surfaces reflow into covering layers. */
export function AppShell({
	tab,
	renderAvatar,
	personName,
	meLabel,
	settingsLabel,
	updateAction,
	onOpenContacts,
	contactsLabel,
	onOpenMe,
	meOpen,
	me,
	side,
	desktop = false,
	onBack,
	backLabel,
	list,
	content,
	detailOpen,
	composer,
	status,
	titlebarInset,
	labels,
	onModeChange,
}: AppShellProps) {
	const container = useRef<HTMLDivElement>(null);
	const meTrigger = useRef<HTMLButtonElement>(null);
	const pane = usePaneLayout();
	const mode = useLayoutMode(container, 1024, desktop);
	const scrollPositions = useRef<Record<string, number>>({});
	const wide = mode === "wide";
	const phone = mode === "mobile";
	const mainBotOpen = phone && Boolean(tab.mobileBot?.active);
	const [dockHeight, setDockHeight] = useState(0);
	const nativeComposer = useChromeSize("--native-dock-height", !phone && Boolean(composer), setDockHeight);
	const covering = !wide && detailOpen;
	const sideOpen = Boolean(side?.pages.length);
	const desktopSettingsOpen = desktop && meOpen && Boolean(me);
	const overDock =
		!meOpen && !sideOpen && (phone || (Boolean(composer) && (wide ? !pane.collapsed : detailOpen || !list)));
	useVisualViewport(container, phone);
	useEffect(() => onModeChange?.(mode), [mode, onModeChange]);
	useEffect(() => {
		if (desktopSettingsOpen) return;
		meTrigger.current?.focus({ preventScroll: true });
		meTrigger.current = null;
	}, [desktopSettingsOpen]);
	const backButton = (
		<IconButton aria-label={backLabel} size="sm" onClick={onBack}>
			<ChevronLeft size={24} strokeWidth={1.8} aria-hidden="true" />
		</IconButton>
	);
	const toggleMe = meOpen && me ? me.onClose : onOpenMe;
	const avatar = (
		<button
			type="button"
			aria-label={meLabel}
			onClick={toggleMe}
			className="flex min-h-11 min-w-11 items-center gap-[var(--spacing-2)] rounded-[var(--radius-sm)] text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
		>
			<span className="shrink-0">{renderAvatar(28)}</span>
			{tab.current === "messages" ? <span className="truncate text-body font-semibold">{personName}</span> : null}
		</button>
	);
	const listChrome = {
		mode,
		desktop,
		left: phone ? avatar : null,
		meOpen: false,
		scroll: { key: tab.current, positions: scrollPositions },
	};
	const contentChrome = {
		mode,
		desktop,
		left: mainBotOpen ? (
			<IconButton aria-label={settingsLabel} aria-expanded={meOpen} size="sm" onClick={toggleMe}>
				<Settings size={20} strokeWidth={1.7} aria-hidden="true" />
			</IconButton>
		) : !wide ? (
			backButton
		) : null,
		meOpen: false,
	};
	return (
		<div
			ref={container}
			data-layout-mode={mode}
			className="relative h-[var(--app-height,100dvh)] w-full overflow-hidden"
			style={{ top: "var(--app-offset-top, 0px)" }}
		>
			<div className="yonder-chrome flex h-full w-full">
				{!phone ? (
					<div
						inert={desktopSettingsOpen}
						aria-hidden={desktopSettingsOpen || undefined}
						className={cn("shrink-0", desktopSettingsOpen && !wide && "invisible")}
					>
						<Rail
							current={tab.current}
							onSelect={tab.onSelect}
							labels={tab.labels}
							ariaLabel={tab.ariaLabel}
							renderAvatar={renderAvatar}
							onOpenMe={(event) => {
								if (desktop) meTrigger.current = event.currentTarget;
								toggleMe();
							}}
							meOpen={meOpen}
							meLabel={meLabel}
							settingsLabel={settingsLabel}
							updateAction={updateAction}
							{...(onOpenContacts ? { onOpenContacts, contactsLabel: contactsLabel ?? "" } : {})}
							titlebarInset={titlebarInset}
						/>
					</div>
				) : null}
				<div ref={pane.panes} className="relative flex min-w-0 flex-1">
					{list ? (
						<aside
							inert={meOpen || covering || sideOpen}
							aria-hidden={meOpen || covering || sideOpen || undefined}
							data-surface="chrome"
							className="relative flex h-full shrink-0 flex-col"
							style={{ width: wide && !pane.collapsed ? pane.width : "100%" }}
						>
							<ShellProvider value={listChrome}>{list}</ShellProvider>
							{wide ? (
								<PaneSplitter
									width={pane.width}
									min={LIST_PANE_MIN}
									max={pane.available}
									onResize={pane.resize}
									onDragChange={pane.setDragging}
									onReset={() => pane.resize(pane.available / 2)}
									label={labels.resizeList}
								/>
							) : null}
							{phone && !covering && !meOpen && !sideOpen ? (
								<MobileDock
									composer={null}
									onHeightChange={setDockHeight}
									showTabs
									current={tab.current}
									onSelect={tab.onSelect}
									labels={tab.labels}
									ariaLabel={tab.ariaLabel}
									botTab={tab.mobileBot}
								/>
							) : null}
						</aside>
					) : null}
					<GesturePanel
						open={detailOpen || !list}
						inline={wide || mainBotOpen}
						active={!meOpen && !sideOpen && (wide ? !pane.collapsed : detailOpen || !list)}
						layerKey="detail"
						onBack={onBack}
						label={backLabel}
						className={cn("z-10", wide && pane.collapsed && "hidden", !phone && "p-[var(--spacing-2)]")}
					>
						<main
							className={cn(
								"relative flex min-h-0 flex-1 flex-col bg-[var(--color-bg-base)]",
								!phone && "overflow-hidden rounded-[var(--radius-lg)]",
							)}
						>
							<ShellProvider value={contentChrome}>{content}</ShellProvider>
							{!phone && composer ? (
								<div
									ref={nativeComposer}
									data-native-composer
									className="relative shrink-0 px-[var(--spacing-4)] pb-[var(--spacing-4)]"
								>
									<div className="mx-auto w-full max-w-[760px]">{composer}</div>
								</div>
							) : null}
							{phone && !meOpen && (detailOpen || !list) ? (
								<MobileDock
									composer={composer}
									onHeightChange={setDockHeight}
									showTabs={mainBotOpen}
									current={tab.current}
									onSelect={tab.onSelect}
									labels={tab.labels}
									ariaLabel={tab.ariaLabel}
									botTab={tab.mobileBot}
								/>
							) : null}
						</main>
					</GesturePanel>
					{pane.dragging && wide ? (
						<div
							aria-hidden="true"
							data-pane-drag-shield
							className="absolute inset-0 z-30 cursor-col-resize bg-transparent"
						/>
					) : null}
					<AnimatePresence>
						{side && sideOpen ? <SideLayers key="side" side={side} mode={mode} desktop={desktop} /> : null}
					</AnimatePresence>
					{status ? (
						<div
							data-floating-status
							className="pointer-events-none absolute inset-x-0 z-40 px-[var(--spacing-3)]"
							style={{
								insetInlineStart: overDock && wide && list ? pane.width : 0,
								bottom: overDock
									? phone
										? dockHeight
										: `calc(${dockHeight}px + var(--spacing-4))`
									: "calc(var(--dock-bottom-inset, var(--safe-area-bottom, env(safe-area-inset-bottom))) + var(--spacing-2))",
							}}
						>
							{status}
						</div>
					) : null}
				</div>
				<AnimatePresence>
					{meOpen && me ? (
						<MeLayers
							key="me"
							me={me}
							mode={mode}
							desktop={desktop}
							titlebarInset={titlebarInset}
							statusVisible={Boolean(status)}
							onBack={onBack}
							backButton={backButton}
							label={meLabel}
							backLabel={backLabel}
							scrollPositions={scrollPositions}
						/>
					) : null}
				</AnimatePresence>
			</div>
		</div>
	);
}

function MeLayers({
	me,
	mode,
	desktop,
	titlebarInset,
	statusVisible,
	onBack,
	backButton,
	label,
	backLabel,
	scrollPositions,
}: {
	me: MeStack;
	mode: LayoutMode;
	desktop: boolean;
	titlebarInset: boolean;
	statusVisible: boolean;
	onBack: () => void;
	backButton: ReactNode;
	label: string;
	backLabel: string;
	scrollPositions: React.RefObject<Record<string, number>>;
}) {
	const wide = mode === "wide";
	const floating = desktop && wide;
	const settingsMode = desktop && !wide ? "mobile" : mode;
	const hasPage = me.pages.length > 0;
	const present = useIsPresent();
	const entering = useRef(true);
	useEffect(() => {
		entering.current = false;
	}, []);
	useDismiss(floating && present, me.onClose, 10);
	const panel = (
		<GesturePanel
			open
			inline={floating}
			active={!desktop || present}
			side="left"
			layerKey="me"
			onBack={me.onClose}
			label={label}
			modal={mode === "mobile" || (desktop && !statusVisible)}
			role={desktop || mode === "mobile" ? "dialog" : "region"}
			priority={10}
			className={cn(
				floating
					? "z-10 h-full max-h-[var(--settings-window-height)] w-full max-w-[var(--settings-window-width)] overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-bg-base)] shadow-[var(--shadow-lg)] motion-safe:animate-pop-in"
					: "z-20",
				!desktop && mode !== "mobile" && "start-[var(--rail-width)]",
				desktop && !wide && titlebarInset && "[--topbar-padding-start:calc(var(--spacing-3)+var(--rail-width))]",
			)}
		>
			<div className="relative flex min-h-0 flex-1">
				<div
					inert={!wide && hasPage}
					aria-hidden={(!wide && hasPage) || undefined}
					data-surface="chrome"
					className={cn(
						"yonder-chrome flex min-h-0 shrink-0 flex-col",
						wide ? "w-[var(--list-pane-default,320px)]" : "w-full",
					)}
				>
					<ShellProvider
						value={{
							mode: settingsMode,
							desktop,
							left:
								wide && !desktop ? null : (
									<IconButton
										aria-label={settingsMode === "mobile" ? backLabel : me.closeLabel}
										size="sm"
										onClick={me.onClose}
									>
										{settingsMode === "mobile" ? (
											<ChevronLeft size={24} aria-hidden="true" />
										) : (
											<X size={20} aria-hidden="true" />
										)}
									</IconButton>
								),
							meOpen: true,
							scroll: { key: "me", positions: scrollPositions },
						}}
					>
						{me.list}
					</ShellProvider>
				</div>
				<div
					className={cn(
						"min-h-0 min-w-0 flex-1",
						wide ? "relative" : "absolute inset-0",
						!hasPage && "pointer-events-none",
					)}
				>
					<AnimatePresence>
						{me.pages.map((page, index) => (
							<GesturePanel
								key={page.key}
								open
								initial={!entering.current}
								active={present && index === me.pages.length - 1}
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
			inert={!present}
			className={cn(
				floating ? "absolute inset-0 z-20 grid place-items-center px-[max(var(--spacing-4),5vw)]" : "contents",
				floating && (titlebarInset ? "py-[max(var(--titlebar-height),5dvh)]" : "py-[max(var(--spacing-6),5dvh)]"),
			)}
		>
			{floating ? <OverlayBackdrop onClose={me.onClose} /> : null}
			{panel}
		</div>
	);
}
