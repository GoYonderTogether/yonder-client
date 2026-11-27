import { cn, IconButton } from "@yonder/ui-components";
import { ICON_SIZE } from "@yonder/ui-tokens";
import { ChevronDown, ChevronLeft, ChevronsRightLeft, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import type { KeyboardEvent, ReactNode } from "react";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GesturePanel } from "../navigation/gesture-panel.tsx";
import type { LayoutMode } from "../responsive/layout-mode.ts";
import { workspaceCardSurface } from "./frames.tsx";
import { ShellProvider } from "./shell-context.tsx";
import { TopBar } from "./top-bar.tsx";
import { useChromeSize } from "./use-chrome-size.ts";

export interface SidePage {
	key: string;
	title: string;
	/** A 16px lucide icon that says what kind of thing the tab holds. */
	icon?: ReactNode;
	content: ReactNode;
}

/** `undefined` outside a detail pane; inside, the slot element once it is mounted. */
const ActionsSlot = createContext<
	{ element: HTMLElement | null; title: HTMLElement | null; desktop: boolean } | undefined
>(undefined);

/**
 * Detail controls share the action row by default. Compact actions can opt into the desktop title
 * bar; on phones those controls stay inline at their call site.
 */
export function SidePageActions({
	children,
	className,
	placement = "row",
}: {
	children: ReactNode;
	className?: string;
	placement?: "row" | "title";
}) {
	const slot = useContext(ActionsSlot);
	if (placement === "title") {
		if (!slot?.desktop) return children;
		return slot.title ? createPortal(children, slot.title) : null;
	}
	if (!slot) return <div className={className}>{children}</div>;
	return slot.element ? createPortal(children, slot.element) : null;
}

interface SideTab {
	key: string;
	pages: readonly SidePage[];
}

export interface SideStack {
	tabs: readonly SideTab[];
	active: string | null;
	expanded: boolean;
	onActivate: (key: string) => void;
	onMove: (key: string, over: string) => void;
	onBack: () => void;
	onClose: (key: string) => void;
	onCloseAll: () => void;
	onCollapse: () => void;
	labels: {
		pane: string;
		back: string;
		close: string;
		closeTab: (title: string) => string;
		closeAll: string;
		/** Names how many tabs 全部关闭 would close; falls back to `closeAll`. */
		closeAllCount?: (count: number) => string;
		collapse: string;
		expand: string;
		resize: string;
	};
}

/** Temporary dialogs remain above the single detail presented on a phone. */
const SIDE_PRIORITY = 18;

export function SideLayers({ side, mode, desktop }: { side: SideStack; mode: LayoutMode; desktop: boolean }) {
	const active = side.tabs.find((tab) => tab.key === side.active);
	return desktop ? (
		<DesktopSide side={side} mode={mode} />
	) : (
		<AnimatePresence>
			{side.expanded && active ? (
				<GesturePanel
					key="side"
					open
					modal
					layerKey="side"
					onBack={side.onBack}
					label={active.pages.at(-1)?.title ?? side.labels.pane}
					priority={SIDE_PRIORITY}
					className="z-40"
				>
					<SidePages
						tab={active}
						mode={mode}
						desktop={desktop}
						mobile
						onBack={side.onBack}
						backLabel={side.labels.back}
					/>
				</GesturePanel>
			) : null}
		</AnimatePresence>
	);
}

function DesktopSide({ side, mode }: { side: SideStack; mode: LayoutMode }) {
	const id = useId();
	const strip = useRef<HTMLDivElement>(null);
	const [titleActions, setTitleActions] = useState<HTMLDivElement | null>(null);
	const [overflow, setOverflow] = useState(false);
	useEffect(() => {
		const list = strip.current;
		if (!list || !side.tabs.length) return;
		const update = () => setOverflow(list.clientWidth > 0 && list.scrollWidth > list.clientWidth);
		const resize = new ResizeObserver(update);
		resize.observe(list);
		update();
		return () => resize.disconnect();
	}, [side.tabs]);
	useEffect(() => {
		if (side.expanded && side.active) {
			document
				.getElementById(`${id}-tab-${encodeURIComponent(side.active)}`)
				?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
		}
	}, [id, side.active, side.expanded]);

	const closeAll =
		side.tabs.length > 1
			? (side.labels.closeAllCount?.(side.tabs.length) ?? side.labels.closeAll)
			: side.labels.closeAll;
	const tabId = (key: string) => `${id}-tab-${encodeURIComponent(key)}`;
	const panelId = (key: string) => `${id}-panel-${encodeURIComponent(key)}`;
	const activate = (key: string) => {
		side.onActivate(key);
		document.getElementById(tabId(key))?.focus({ preventScroll: true });
	};
	function keys(event: KeyboardEvent<HTMLButtonElement>, index: number, key: string) {
		const { length } = side.tabs;
		const next =
			event.key === "ArrowRight"
				? (index + 1) % length
				: event.key === "ArrowLeft"
					? (index + length - 1) % length
					: event.key === "Home"
						? 0
						: event.key === "End"
							? length - 1
							: -1;
		if (event.key === "Delete") {
			event.preventDefault();
			side.onClose(key);
		} else if (next >= 0) {
			event.preventDefault();
			const target = side.tabs[next];
			if (target) activate(target.key);
		}
	}
	return (
		<aside
			aria-label={side.labels.pane}
			data-detail-pane
			className={cn("flex h-full min-h-0 min-w-0 flex-1 flex-col", workspaceCardSurface)}
		>
			<header
				data-shell-topbar
				data-tauri-drag-region
				className="flex h-[var(--titlebar-height)] shrink-0 items-center gap-[var(--spacing-1)] border-b border-[var(--color-border-subtle)] ps-[var(--spacing-2)] pe-[var(--spacing-3)]"
			>
				<div
					ref={strip}
					role="tablist"
					aria-label={side.labels.pane}
					className="flex min-w-0 gap-[var(--spacing-1)] overflow-x-auto [scrollbar-width:none]"
				>
					{side.tabs.map((tab, index) => {
						const title = tab.pages[0]?.title ?? "";
						const icon = tab.pages[0]?.icon;
						const selected = tab.key === side.active;
						const closable = selected || side.tabs.length === 1;
						return (
							<div
								key={tab.key}
								role="presentation"
								className={cn(
									"group flex min-w-[calc(var(--spacing-12)*2)] shrink items-center rounded-[var(--radius-control-sm)]",
									selected ? "bg-[var(--color-bg-selected)]" : "hover:bg-[var(--color-bg-hover)]",
								)}
							>
								<button
									id={tabId(tab.key)}
									type="button"
									role="tab"
									aria-controls={panelId(tab.key)}
									aria-selected={selected}
									tabIndex={selected ? 0 : -1}
									title={title}
									draggable
									onDragStart={(event) => event.dataTransfer.setData("application/x-yonder-detail-tab", tab.key)}
									onDragOver={(event) => {
										if (event.dataTransfer.types.includes("application/x-yonder-detail-tab")) event.preventDefault();
									}}
									onDrop={(event) => {
										const moved = event.dataTransfer.getData("application/x-yonder-detail-tab");
										if (!moved) return;
										event.preventDefault();
										side.onMove(moved, tab.key);
									}}
									onClick={() => side.onActivate(tab.key)}
									onKeyDown={(event) => keys(event, index, tab.key)}
									className={cn(
										"flex min-h-[var(--control-sm)] min-w-0 flex-1 max-w-[calc(var(--side-panel-width)/2)] items-center gap-[var(--spacing-2)] rounded-[var(--radius-control-sm)] ps-[var(--spacing-2)] text-caption focus-visible:outline-[var(--color-accent)]",
										selected
											? "font-medium text-[var(--color-text-primary)]"
											: "text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)]",
										closable ? "pe-[var(--spacing-1)]" : "pe-[var(--spacing-2)]",
									)}
								>
									{icon ? <span className="shrink-0 text-[var(--color-text-tertiary)]">{icon}</span> : null}
									<span className="truncate">{title}</span>
								</button>
								<button
									type="button"
									tabIndex={selected ? 0 : -1}
									aria-label={side.labels.closeTab(title)}
									title={side.labels.closeTab(title)}
									onClick={() => side.onClose(tab.key)}
									className={cn(
										"me-[var(--spacing-1)] grid size-[var(--spacing-6)] shrink-0 place-items-center rounded-[var(--radius-control-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-active)] focus-visible:outline-[var(--color-accent)]",
										!closable && "invisible group-hover:visible group-focus-within:visible",
									)}
								>
									<X size={ICON_SIZE.sm} aria-hidden="true" />
								</button>
							</div>
						);
					})}
				</div>
				{overflow ? (
					<label className="relative grid size-[var(--control-sm)] shrink-0 place-items-center rounded-[var(--radius-sm)] focus-within:outline-2 focus-within:outline-[var(--color-accent)]">
						<ChevronDown size={16} aria-hidden="true" />
						<select
							aria-label={side.labels.pane}
							value={side.active ?? ""}
							onChange={(event) => activate(event.currentTarget.value)}
							className="absolute inset-0 size-full cursor-pointer opacity-0"
						>
							{side.tabs.map((tab) => (
								<option key={tab.key} value={tab.key}>
									{tab.pages[0]?.title}
								</option>
							))}
						</select>
					</label>
				) : null}
				<div data-tauri-drag-region className="min-h-full min-w-0 flex-1 self-stretch" />
				<div
					ref={setTitleActions}
					data-side-title-actions
					className="flex shrink-0 items-center gap-[var(--spacing-1)] empty:hidden"
				/>
				<div className="flex shrink-0 items-center gap-[var(--spacing-1)]">
					<IconButton
						aria-label={side.labels.collapse}
						title={side.labels.collapse}
						size="sm"
						onClick={side.onCollapse}
					>
						<ChevronsRightLeft size={18} aria-hidden="true" />
					</IconButton>
					<span
						aria-hidden="true"
						className="mx-[var(--spacing-1)] h-[var(--spacing-4)] w-px bg-[var(--color-border-default)]"
					/>
					<IconButton aria-label={side.labels.closeAll} title={closeAll} size="sm" onClick={side.onCloseAll}>
						<X size={ICON_SIZE.md} aria-hidden="true" />
					</IconButton>
				</div>
			</header>
			{side.tabs.map((tab) => (
				<div
					key={tab.key}
					role="tabpanel"
					id={panelId(tab.key)}
					aria-labelledby={tabId(tab.key)}
					data-detail-tab-panel
					hidden={tab.key !== side.active}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: APG tabpanel must be reachable when its reader has only text.
					tabIndex={0}
					className={cn("min-h-0 flex-1 outline-none", tab.key === side.active && "flex flex-col")}
				>
					<SidePages
						tab={tab}
						mode={mode}
						desktop
						onBack={side.onBack}
						backLabel={side.labels.back}
						titleActions={tab.key === side.active ? titleActions : null}
					/>
				</div>
			))}
		</aside>
	);
}

function SidePages({
	tab,
	mode,
	desktop,
	mobile,
	onBack,
	backLabel,
	titleActions = null,
}: {
	tab: SideTab;
	mode: LayoutMode;
	desktop: boolean;
	mobile?: boolean;
	onBack: () => void;
	backLabel: string;
	titleActions?: HTMLElement | null;
}) {
	const active = tab.pages.at(-1);
	const frame = useRef<HTMLDivElement>(null);
	const previous = useRef({ key: tab.key, depth: 0 });
	useEffect(() => {
		const opened = previous.current.key !== tab.key || tab.pages.length > previous.current.depth;
		previous.current = { key: tab.key, depth: tab.pages.length };
		if (mobile && opened) frame.current?.closest<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
	}, [mobile, tab.key, tab.pages.length]);
	const header = useChromeSize("--frame-header-height", Boolean(mobile || tab.pages.length > 1));
	return (
		<div ref={frame} data-shell-frame className="relative flex min-h-0 flex-1 flex-col">
			{mobile || tab.pages.length > 1 ? (
				<div ref={header} data-frame-header className="shrink-0">
					<TopBar
						left={
							<IconButton aria-label={backLabel} size="sm" onClick={onBack}>
								<ChevronLeft size={24} aria-hidden="true" />
							</IconButton>
						}
						center={active?.title}
						titleAlign="start"
						phone={Boolean(mobile)}
					/>
				</div>
			) : null}
			{tab.pages.map((page) => (
				<SidePageFrame
					key={page.key}
					page={page}
					active={page === active}
					mode={mode}
					desktop={desktop}
					titleActions={page === active ? titleActions : null}
				/>
			))}
		</div>
	);
}

function SidePageFrame({
	page,
	active,
	mode,
	desktop,
	titleActions,
}: {
	page: SidePage;
	active: boolean;
	mode: LayoutMode;
	desktop: boolean;
	titleActions: HTMLElement | null;
}) {
	const [element, setElement] = useState<HTMLElement | null>(null);
	return (
		<div hidden={!active} className="flex min-h-0 flex-1 flex-col">
			<div
				ref={setElement}
				data-side-actions
				className="flex shrink-0 flex-wrap items-center justify-end gap-[var(--spacing-2)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-2)] empty:hidden"
			/>
			<section
				data-frame-scroll
				aria-label={page.title}
				className="min-h-0 flex-1 touch-pan-y touch-pinch-zoom overflow-y-auto overscroll-contain"
			>
				<ActionsSlot value={{ element, title: titleActions, desktop }}>
					<ShellProvider value={{ mode, desktop, left: null, meOpen: false }}>{page.content}</ShellProvider>
				</ActionsSlot>
			</section>
		</div>
	);
}
