import { isTauri } from "./keychain.ts";

/**
 * One name per meaning, so the same action always feels the same (Apple HIG, Playing haptics):
 * selection for a changed choice, light for the keyboard rising, medium for a recording starting,
 * error for a message that did not send. The system mutes them when the person turns system
 * haptics off; browsers have no equivalent, so there they do nothing.
 */
export type Haptic = "selection" | "light" | "medium" | "error";

const nativeMobile = () =>
	isTauri() && typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export function haptic(kind: Haptic) {
	if (!nativeMobile()) return;
	void import("@tauri-apps/api/core")
		.then(({ invoke }) =>
			kind === "selection"
				? invoke("plugin:haptics|selection_feedback")
				: kind === "error"
					? invoke("plugin:haptics|notification_feedback", { type: "error" })
					: invoke("plugin:haptics|impact_feedback", { style: kind }),
		)
		// Feedback is a garnish: a missing plugin or permission never interrupts the action itself.
		.catch(() => undefined);
}
