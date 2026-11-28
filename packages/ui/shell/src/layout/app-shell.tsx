import { Button, cn, IconButton } from "@yonder/ui-components";
import { ChevronLeft, Ellipsis, PanelLeft } from "lucide-react";
import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { GesturePanel } from "../navigation/gesture-panel.tsx";
import type { TabId } from "../navigation/routes.ts";
import { backAction, leaveApp, listenForSystemBack } from "../navigation/system-back.ts";
import { dismissTopLayer, hasOpenLayer } from "../navigation/use-dismiss.ts";
import type { LayoutMode } from "../responsive/layout-mode.ts";
import { LIST_PANE_MIN } from "../responsive/layout-mode.ts";
import { useKeyboardDismiss } from "../responsive/use-keyboard-dismiss.ts";
import { useLayoutMode } from "../responsive/use-layout-mode.ts";
import { useVisualViewport } from "../responsive/use-visual-viewport.ts";
import { workspaceCardInset, workspaceCardSurface } from "./frames.tsx";
import { MeLayers } from "./me-layers.tsx";
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
	messagesUnread?: MobileDockProps["messagesUnread"];
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
	inviteAction?: ReactNode;
	onOpenMe: () => void;
	meOpen: boolean;
	me?: MeStack | undefined;
	/** The right-hand side panel; the frame's top layer while it has a page. */
	side?: SideStack | undefined;
	desktop?: boolean;
	onBack: () => void;
	backLabel: string;
	showContentBack?: boolean;
	mobileShowList?: boolean;
	list: ReactNode | null;
	content: ReactNode;
	detailOpen: boolean;
	composer: ReactNode | null;
	composerAttachmentOpen?: boolean;
	status?: ReactNode;
	titlebarInset: boolean;
	brand: ReactNode;
	labels: { showList: string; hideList: string; resizeList: string };
	locationKey: string;
	onModeChange?: (mode: LayoutMode) => void;
	onSideCoverChange?: (covering: boolean) => void;
}

const DETAIL_WIDTH = 400;
const DETAIL_MIN = 300;
const WORKSPACE_MIN = 360;

/** Host chrome stays stable while the same list and detail surfaces reflow into covering layers. */
export function AppShell({
	tab,
	renderAvatar,
	personName,
	meLabel,
	settingsLabel,
	updateAction,
	inviteAction,
	onOpenMe,
	meOpen,
	me,
	side,
	desktop = false,
	onBack,
	backLabel,
	showContentBack,
	list,
	content,
	detailOpen,
	composer,
	composerAttachmentOpen = false,
	status,
	titlebarInset,
	labels,
	onModeChange,
	onSideCoverChange,
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
	const sideOpen = Boolean(side?.expanded);
	const inlineSide = desktop && pane.available >= DETAIL_MIN + WORKSPACE_MIN && (!meOpen || wide);
	const sideCover = sideOpen && !inlineSide;
	const [preferredSideWidth, setSideWidth] = useState(DETAIL_WIDTH);
	const [sideDragging, setSideDragging] = useState(false);
	const [showFoldedList, setShowFoldedList] = useState(false);
	const sideWidth = Math.min(preferredSideWidth, pane.available - WORKSPACE_MIN);
	const foldedList = wide && sideOpen && inlineSide && pane.available - sideWidth - pane.width < WORKSPACE_MIN;
	const listCollapsed = wide && pane.collapsed && !(inlineSide && sideOpen);
	const desktopSettingsOpen = desktop && meOpen && Boolean(me);
	const overDock =
		!meOpen && !sideCover && (phone || (Boolean(composer) && (wide ? !listCollapsed : detailOpen || !list)));
	const keyboard = useVisualViewport(container, phone);
	const rootDock = phone && !meOpen && (mainBotOpen || (!covering && Boolean(list)));
	const statusBottom = phone
		? rootDock
			? "var(--native-root-dock-height, 0px)"
			: dockHeight
		: `calc(${dockHeight}px + var(--spacing-4))`;
	useKeyboardDismiss(container, keyboard);
	useEffect(() => onModeChange?.(mode), [mode, onModeChange]);
	useEffect(() => onSideCoverChange?.(sideCover), [onSideCoverChange, sideCover]);
	// The system's Back closes the topmost layer first; with nothing open it follows history, and
	// only a page with nothing behind it leaves the app. A browser tab never registers this.
	useEffect(() => {
		let listener: { unregister(): Promise<void> } | null = null;
		let disposed = false;
		void listenForSystemBack((canGoBack) => {
			const action = backAction(hasOpenLayer(), canGoBack);
			if (action === "layer") {
				dismissTopLayer();
				return;
			}
			if (action === "history") {
				history.back();
				return;
			}
			void leaveApp();
		}).then((registered) => {
			if (disposed) void registered?.unregister();
			else listener = registered;
		});
		return () => {
			disposed = true;
			void listener?.unregister();
		};
	}, []);
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
	const revealSide =
		desktop && side && !sideOpen && side.active ? (
			<Button
				data-detail-reveal=""
				aria-label={side.labels.expand}
				title={side.labels.expand}
				aria-expanded={false}
				size="sm"
				variant="secondary"
				className="ms-[var(--spacing-2)] px-[var(--spacing-2)]"
				onClick={() => {
					if (side.active) side.onActivate(side.active);
					requestAnimationFrame(() =>
						container.current?.querySelector<HTMLButtonElement>('[data-detail-pane] [aria-selected="true"]')?.focus(),
					);
				}}
			>
				<Ellipsis size={20} aria-hidden="true" />
				{side.tabs.length > 1 ? <span className="text-micro font-medium tabular-nums">{side.tabs.length}</span> : null}
			</Button>
		) : null;
	const revealOnList = Boolean(list && (listCollapsed || (!wide && !detailOpen) || !content));
	const showListButton =
		foldedList && list ? (
			<IconButton
				aria-label={showFoldedList ? labels.hideList : labels.showList}
				size="sm"
				aria-expanded={showFoldedList}
				onClick={() => setShowFoldedList((show) => !show)}
			>
				<PanelLeft size={20} aria-hidden="true" />
			</IconButton>
		) : null;
	/** Every phone tab root, the main Bot included, opens 「我」 from the same top-left avatar. */
	const avatar = (withName: boolean) => (
		<button
			type="button"
			data-account-avatar
			aria-label={meLabel}
			aria-expanded={withName ? undefined : meOpen}
			onClick={toggleMe}
			className="flex min-h-11 min-w-11 items-center gap-[var(--spacing-2)] rounded-[var(--radius-sm)] text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
		>
			<span className="shrink-0">{renderAvatar(28)}</span>
			{withName ? <span className="truncate text-body font-semibold">{personName}</span> : null}
		</button>
	);
	const listChrome = {
		mode,
		desktop,
		left: phone ? avatar(tab.current === "messages") : null,
		detailAction: !meOpen && revealOnList ? revealSide : null,
		meOpen: false,
		scroll: { key: tab.current, positions: scrollPositions },
	};
	const contentChrome = {
		mode,
		desktop,
		left: mainBotOpen ? avatar(false) : !wide || showContentBack ? backButton : showListButton,
		detailAction: !meOpen && !revealOnList ? revealSide : null,
		meOpen: false,
	};
	return (
		<div
			ref={container}
			data-layout-mode={mode}
			data-keyboard={keyboard || undefined}
			className="relative h-[var(--app-height,100dvh)] w-full overflow-hidden"
			style={{ top: "var(--app-offset-top, 0px)" }}
		>
			<div className={cn("yonder-chrome relative flex h-full w-full", phone && "flex-col")}>
				{!phone ? (
					<div
						inert={desktopSettingsOpen || sideCover}
						aria-hidden={desktopSettingsOpen || sideCover || undefined}
						className={cn("shrink-0", desktopSettingsOpen && !wide && "invisible")}
					>
						<Rail
							current={tab.current}
							onSelect={tab.onSelect}
							labels={tab.labels}
							ariaLabel={tab.ariaLabel}
							messagesUnread={tab.messagesUnread}
							renderAvatar={renderAvatar}
							onOpenMe={(event) => {
								if (desktop) meTrigger.current = event.currentTarget;
								toggleMe();
							}}
							meOpen={meOpen}
							meLabel={meLabel}
							settingsLabel={settingsLabel}
							updateAction={updateAction}
							inviteAction={inviteAction}
							titlebarInset={titlebarInset}
						/>
					</div>
				) : null}
				<div ref={pane.panes} className="flex min-h-0 min-w-0 flex-1">
					<div className="relative flex min-w-0 flex-1">
						{list ? (
							<aside
								inert={meOpen || covering || sideCover}
								aria-hidden={meOpen || covering || sideCover || undefined}
								data-surface="chrome"
								data-mobile-root-surface={(rootDock && !mainBotOpen) || undefined}
								className={cn(
									"relative flex h-full shrink-0 flex-col",
									foldedList &&
										(showFoldedList
											? "!absolute inset-y-0 start-0 z-20 bg-[var(--color-bg-page)] shadow-[var(--shadow-lg)]"
											: "hidden"),
								)}
								style={{ width: wide && !listCollapsed ? pane.width : "100%" }}
							>
								<ShellProvider value={listChrome}>{list}</ShellProvider>
								{wide && !foldedList ? (
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
							</aside>
						) : null}
						{/* The main Bot tab is a root, not the pushed detail that animates on exit. */}
						<GesturePanel
							key={mainBotOpen ? "main-bot-tab" : "detail"}
							open={detailOpen || !list}
							inline={wide || mainBotOpen}
							instantBack={phone}
							active={!meOpen && !sideCover && (wide ? !listCollapsed : detailOpen || !list)}
							layerKey="detail"
							onBack={onBack}
							label={backLabel}
							className={cn("z-10", listCollapsed && "hidden", !phone && workspaceCardInset)}
						>
							<main
								data-mobile-root-surface={(rootDock && mainBotOpen) || undefined}
								className={cn(
									"relative flex min-h-0 flex-1 flex-col",
									phone ? "bg-[var(--color-bg-base)]" : workspaceCardSurface,
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
								{phone && !mainBotOpen && !meOpen && (detailOpen || !list) ? (
									<MobileDock
										composer={composer}
										onHeightChange={setDockHeight}
										showTabs={false}
										current={tab.current}
										onSelect={tab.onSelect}
										labels={tab.labels}
										ariaLabel={tab.ariaLabel}
										botTab={tab.mobileBot}
										messagesUnread={tab.messagesUnread}
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
						{status ? (
							<div
								data-floating-status
								className="pointer-events-none absolute inset-x-0 z-40 px-[var(--spacing-3)]"
								style={{
									insetInlineStart: overDock && wide && list && !foldedList ? pane.width : 0,
									bottom: overDock
										? statusBottom
										: "calc(var(--dock-bottom-inset, var(--safe-area-bottom, env(safe-area-inset-bottom))) + var(--spacing-2))",
								}}
							>
								{status}
							</div>
						) : null}
					</div>
					{side ? (
						<div
							data-detail-dock
							inert={desktop && !sideOpen}
							aria-hidden={(desktop && !sideOpen) || undefined}
							className={cn(
								desktop
									? inlineSide
										? "relative z-30 flex h-full shrink-0"
										: "absolute inset-0 z-40 flex"
									: "contents",
								desktop && !sideOpen && !inlineSide && "hidden",
								inlineSide && !sideDragging && "motion-safe:transition-[width] duration-[var(--duration-fast)]",
							)}
							style={inlineSide ? { width: sideOpen ? sideWidth : 0 } : undefined}
						>
							{inlineSide && sideOpen ? (
								<PaneSplitter
									width={sideWidth}
									min={DETAIL_MIN}
									max={pane.available - WORKSPACE_MIN}
									edge="start"
									onResize={setSideWidth}
									onDragChange={setSideDragging}
									onReset={() => setSideWidth(DETAIL_WIDTH)}
									label={side.labels.resize}
								/>
							) : null}
							<div className={desktop ? "flex min-w-0 flex-1 overflow-hidden" : "contents"}>
								<div
									className={desktop ? cn("flex shrink-0", !inlineSide && "w-full", workspaceCardInset) : "contents"}
									style={inlineSide ? { width: sideWidth } : undefined}
								>
									<SideLayers
										side={{
											...side,
											onCollapse: () => {
												setShowFoldedList(false);
												side.onCollapse();
												requestAnimationFrame(() =>
													container.current
														?.querySelector<HTMLButtonElement>("[data-detail-reveal]")
														?.focus({ preventScroll: true }),
												);
											},
										}}
										mode={mode}
										desktop={desktop}
									/>
								</div>
							</div>
						</div>
					) : null}
				</div>
				{rootDock ? (
					<MobileDock
						root
						inert={sideCover}
						composer={mainBotOpen ? composer : null}
						onHeightChange={setDockHeight}
						showTabs={!sideCover && !keyboard && !composerAttachmentOpen}
						current={tab.current}
						onSelect={tab.onSelect}
						labels={tab.labels}
						ariaLabel={tab.ariaLabel}
						botTab={tab.mobileBot}
						messagesUnread={tab.messagesUnread}
					/>
				) : null}
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
							scrollPositions={scrollPositions}
							covered={sideCover}
							sideWidth={inlineSide && sideOpen ? sideWidth : 0}
							detailAction={meOpen ? revealSide : null}
						/>
					) : null}
				</AnimatePresence>
			</div>
		</div>
	);
}
