/**
 * Layout is decided by the width of the container, never by what device it is (架构-12 布局第 2 条).
 * Thresholds from 11-布局和页面层级 第四节:
 *
 *   ≥ 1024  wide:   rail, list column, content column
 *   ≥ 640   medium: rail and content; the list floats out from a button (like Today's narrow window)
 *   < 640   mobile: one screen at a time, a bottom dock with the composer and the tab bar
 */
export type LayoutMode = "wide" | "medium" | "mobile";

export const WIDE_MIN_WIDTH = 1024;
export const MOBILE_MAX_WIDTH = 640;

export function layoutMode(width: number): LayoutMode {
	if (width >= WIDE_MIN_WIDTH) return "wide";
	if (width < MOBILE_MAX_WIDTH) return "mobile";
	return "medium";
}

/** The list column's width bounds; it can be dragged between them. */
export const LIST_PANE_MIN = 260;
export const LIST_PANE_MAX = 420;
export const LIST_PANE_DEFAULT = 320;

export function clampListPane(width: number): number {
	return Math.min(LIST_PANE_MAX, Math.max(LIST_PANE_MIN, Math.round(width)));
}
