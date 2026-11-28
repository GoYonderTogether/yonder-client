// Desktop control (computer use) result and argument shapes (desktop control design, 2026-11-28 §5).
//
// Kept in their own module so the connector contract stays readable as it grows; `connectors.ts`
// re-exports everything here, so `@yonder/protocol` exposes it unchanged.

/** What a `desktop_input` call does (design §5). */
export type DesktopInputAction = "click" | "type" | "key" | "scroll" | "drag";

/** How input reaches the window: background never raises it; foreground raises it and moves the real cursor. */
export type DesktopInputDelivery = "background" | "foreground";

/** The system permissions desktop control can be missing, named so the owner can turn on the right one. */
export type DesktopPermission = "accessibility" | "screen_recording";

/** A window-relative rectangle in points (screen pixels before Retina scaling). */
export interface DesktopBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** One top-level window, as `desktop_windows` reports it. */
export interface DesktopWindow {
	/** Opaque id, stable for this listing; pass it back as `windowId`. */
	id: string;
	app: string;
	title: string;
	pid: number;
	bounds: DesktopBounds;
	focused: boolean;
}

/** One accessibility node. `ref` is opaque, valid only within the `desktop_ax` read that returned it. */
export interface DesktopAxNode {
	ref: string;
	role: string;
	title?: string;
	value?: string;
	bounds?: DesktopBounds;
	actions: string[];
}

/** The accessibility tree of one window or the whole app, as `desktop_ax` reports it. */
export type DesktopConnectorResult =
	| { kind: "desktop_windows"; windows: DesktopWindow[] }
	| { kind: "desktop_ax"; nodes: DesktopAxNode[]; truncated: boolean }
	| {
			kind: "desktop_shot";
			image: { base64: string; mimeType: string; width: number; height: number };
			capturedAt: string;
	  }
	| { kind: "desktop_input"; ok: true; delivered: DesktopInputDelivery; changed?: boolean };
