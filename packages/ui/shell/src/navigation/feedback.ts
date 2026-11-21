/**
 * The shell names the moments that deserve a haptic; the host decides how to play them. Without a
 * host handler (a browser, tests) the calls do nothing.
 */
export type ShellHaptic = "selection" | "light" | "medium" | "error";

let handler: ((kind: ShellHaptic) => void) | null = null;

export function setShellHaptics(next: ((kind: ShellHaptic) => void) | null) {
	handler = next;
}

export function shellHaptic(kind: ShellHaptic) {
	handler?.(kind);
}
