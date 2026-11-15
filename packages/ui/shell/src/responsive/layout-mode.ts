/** Width controls pane arrangement; the host independently selects desktop or phone chrome. */
export type LayoutMode = "wide" | "medium" | "compact" | "mobile";

export const WIDE_MIN_WIDTH = 1024;
export const MOBILE_MAX_WIDTH = 640;

export function layoutMode(width: number, desktop = false): LayoutMode {
	if (width >= WIDE_MIN_WIDTH) return "wide";
	if (width < MOBILE_MAX_WIDTH) return desktop ? "compact" : "mobile";
	return "medium";
}

/** The list column's width bounds; it can be dragged between them. */
export const LIST_PANE_MIN = 260;
export const LIST_PANE_MAX = 420;
export const LIST_PANE_DEFAULT = 320;

export function clampListPane(width: number): number {
	return Math.min(LIST_PANE_MAX, Math.max(LIST_PANE_MIN, Math.round(width)));
}
