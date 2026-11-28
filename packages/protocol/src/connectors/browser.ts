/**
 * Browser control on `computer-control` with `browser`: the operation names, the command arguments
 * and the results, in their own module because they are a self-contained protocol family (like the
 * terminal's) and `connectors.ts` is already near its length limit. Version 10 only
 * (`BROWSER_TOOLS_VERSION`, specs/connectors/browser.md §4).
 */

export type BrowserConnectorOperation =
	| "browser_status"
	| "browser_session"
	| "browser_navigate"
	| "browser_observe"
	| "browser_act";

/** What `browser_session` does to the Agent Window sessions: open one, close one, or list them. */
export type BrowserSessionAction = "start" | "stop" | "list";
/** What `browser_act` does to one element, or to the page itself. */
export type BrowserActAction = "click" | "fill" | "press" | "select" | "hover" | "scroll" | "screenshot";

/**
 * One browser the device's browser control can see: Chrome or Edge with its extension connected.
 * `extensions` is a count the device's profile reports; `bsk`'s connected-browser list does not
 * carry it, so the device reports 0 rather than a guessed number.
 */
export interface BrowserSummary {
	name: string;
	version: string;
	extensions: number;
}

/** One Agent Window session a `browser_session` call reports: the page it shows. */
export interface BrowserSessionSummary {
	id: string;
	url: string;
	title: string;
}

/** One ref-addressable element a `browser_observe` snapshot returns. */
export interface BrowserElement {
	ref: string;
	role: string;
	name: string;
	value?: string;
}

/** A screenshot the device encodes to PNG and returns inline, base64, not as a stored attachment. */
export interface BrowserScreenshot {
	/** Base64 of the PNG bytes, no `data:` prefix. */
	base64: string;
	mimeType: "image/png";
	/** Pixels, from the PNG header. */
	width: number;
	height: number;
}

export type BrowserConnectorResult =
	| {
			kind: "browser_status";
			/** Whether the `bsk` command and its browser extension are installed on the device. */
			installed: boolean;
			/** Whether the background daemon that owns the browser connection is running. */
			daemonRunning: boolean;
			/** Whether a Chrome or Edge window with the extension is attached right now. */
			connected: boolean;
			browsers: BrowserSummary[];
			/** The device's own next step for the owner, told in one line. */
			hint: string;
	  }
	| {
			kind: "browser_session";
			sessions: BrowserSessionSummary[];
			/** Present when a `start` or `stop` named one session. */
			sessionId?: string;
	  }
	| { kind: "browser_navigate"; url: string; title: string }
	| {
			kind: "browser_observe";
			text: string;
			/** `snapshot` only: the elements `browser_act` addresses by ref. */
			elements?: BrowserElement[];
			truncated: boolean;
	  }
	| {
			kind: "browser_act";
			ok: boolean;
			/** `screenshot` only: the encoded PNG, inline so one command receipt stays one body. */
			image?: BrowserScreenshot;
	  };

/** The browser-control failure codes, mixed into `ConnectorExecutionError` (specs/connectors/browser.md §5). */
export type BrowserExecutionError = "browser_not_installed" | "browser_disconnected" | "browser_session_not_found";
