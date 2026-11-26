/**
 * `@yonder/ui-shell` — layer 3. The frame: the rail or the tab bar, the list and content columns,
 * the phone's bottom dock, the headers, and how the three layers are entered and left.
 *
 * The shell knows nothing about which features exist. It is handed slots; it decides their shape.
 */

export type { AppShellProps, MeStack, ShellTab } from "./layout/app-shell.tsx";
export { AppShell } from "./layout/app-shell.tsx";
export { ListFrame, PageFrame } from "./layout/frames.tsx";
export type { MobileDockProps } from "./layout/mobile-dock.tsx";
export { MobileDock } from "./layout/mobile-dock.tsx";
export type { PaneSplitterProps } from "./layout/pane-splitter.tsx";
export { PaneSplitter } from "./layout/pane-splitter.tsx";
export type { RailProps } from "./layout/rail.tsx";
export { Rail } from "./layout/rail.tsx";
export type { ShellChrome } from "./layout/shell-context.tsx";
export { ShellProvider, useShellChrome } from "./layout/shell-context.tsx";
export type { SidePage, SideStack } from "./layout/side-layers.tsx";
export { SideLayers } from "./layout/side-layers.tsx";
export type { SidePanelControls } from "./layout/side-panel-context.tsx";
export { SidePanelProvider, useSidePanel } from "./layout/side-panel-context.tsx";
export { TopBar } from "./layout/top-bar.tsx";
export type { ShellHaptic } from "./navigation/feedback.ts";
export { setShellHaptics, shellHaptic } from "./navigation/feedback.ts";
export type { GesturePanelProps } from "./navigation/gesture-panel.tsx";
export { GesturePanel } from "./navigation/gesture-panel.tsx";
export type { Layer, RouteEntry, TabId, TabSpec } from "./navigation/routes.ts";
export {
	BOT_VISITS,
	BOT_VISITS_PATH,
	isTab,
	locate,
	MAIN_CONVERSATION,
	ROUTES,
	TAB_SPECS,
	TABS,
	tabPath,
} from "./navigation/routes.ts";
export { backAction, leaveApp, listenForSystemBack } from "./navigation/system-back.ts";
export type { SwipeHandlers } from "./navigation/use-dismiss.ts";
export { dismissTopLayer, hasOpenLayer, swipeToDismiss, topLayer, useDismiss } from "./navigation/use-dismiss.ts";
export type { ConfirmDialogProps } from "./overlay/confirm-dialog.tsx";
export { ConfirmDialog, DiscardChangesDialog } from "./overlay/confirm-dialog.tsx";
export type { OverlayProps } from "./overlay/overlay.tsx";
export { Overlay } from "./overlay/overlay.tsx";
export {
	clampListPane,
	LIST_PANE_DEFAULT,
	LIST_PANE_MAX,
	LIST_PANE_MIN,
	layoutMode,
	MOBILE_MAX_WIDTH,
	useLayoutMode,
	WIDE_MIN_WIDTH,
} from "./responsive/index.ts";
export type { LayoutMode } from "./responsive/layout-mode.ts";
