import { expect, test, vi } from "vitest";
import { type ComposerKeyDown, type ComposerKeyEvent, composerKeyAction, handleComposerKey } from "./composer-keys.ts";

const base: ComposerKeyEvent = {
	key: "Enter",
	shiftKey: false,
	isComposing: false,
	keyCode: 13,
	repeat: false,
	sendOnEnter: true,
	completionOpen: false,
};

test("a Latin Enter sends once, with no second press and no composition window", () => {
	expect(composerKeyAction(base)).toBe("send");
	// The same event straight after a composition ended is still a send: there is no time window.
	expect(composerKeyAction({ ...base, isComposing: false, keyCode: 13 })).toBe("send");
});

test("Shift+Enter inserts a newline", () => {
	expect(composerKeyAction({ ...base, shiftKey: true })).toBe("newline");
	expect(composerKeyAction({ ...base, shiftKey: true, sendOnEnter: false })).toBe("newline");
});

test("a phone composer keeps Enter as a newline unless the completion popup takes it", () => {
	expect(composerKeyAction({ ...base, sendOnEnter: false })).toBe("newline");
});

test("an open completion popup takes Enter to select, and only when send-on-Enter is on", () => {
	expect(composerKeyAction({ ...base, completionOpen: true })).toBe("accept-completion");
	// A phone composer has no Enter-to-send, so the popup owns Enter there too.
	expect(composerKeyAction({ ...base, completionOpen: true, sendOnEnter: false })).toBe("accept-completion");
	expect(composerKeyAction({ ...base, completionOpen: true, shiftKey: true })).toBe("newline");
});

test("the Enter that confirms an IME candidate does not send; the next Enter sends at any interval", () => {
	// Modern engines report isComposing on the confirming key; Safari can report keyCode 229 after
	// compositionend has already fired.
	expect(composerKeyAction({ ...base, isComposing: true })).toBe("ignore");
	expect(composerKeyAction({ ...base, keyCode: 229 })).toBe("ignore");
	expect(composerKeyAction({ ...base, isComposing: true, completionOpen: true })).toBe("ignore");
	expect(composerKeyAction({ ...base, keyCode: 229, sendOnEnter: false })).toBe("ignore");
	// The very next Enter, with no delay, is an ordinary send.
	expect(composerKeyAction(base)).toBe("send");
});

test("a held key neither sends nor selects the popup twice", () => {
	expect(composerKeyAction({ ...base, repeat: true })).toBe("consume");
	expect(composerKeyAction({ ...base, repeat: true, completionOpen: true })).toBe("consume");
	// Where Enter is a newline anyway, the browser's repeat inserting more newlines is correct.
	expect(composerKeyAction({ ...base, repeat: true, sendOnEnter: false })).toBe("newline");
});

test("keys other than Enter are handed to the popup and dictation", () => {
	expect(composerKeyAction({ ...base, key: "a" })).toBe("passthrough");
	expect(composerKeyAction({ ...base, key: "ArrowDown", completionOpen: true })).toBe("passthrough");
	expect(composerKeyAction({ ...base, key: "Escape" })).toBe("passthrough");
	expect(composerKeyAction({ ...base, key: "Tab", completionOpen: true })).toBe("passthrough");
});

/** A fake keydown that records whether the handler took the key from the browser. */
function keydown(overrides: Partial<ComposerKeyEvent> = {}) {
	const event: ComposerKeyDown = {
		key: "Enter",
		shiftKey: false,
		isComposing: false,
		keyCode: 13,
		repeat: false,
		preventDefault: vi.fn(),
		...overrides,
	};
	let popupAccepted = false;
	const actions = { acceptCompletion: vi.fn(() => popupAccepted), send: vi.fn(), interrupt: vi.fn() };
	return { event, actions, takePopup: () => (popupAccepted = true) };
}

test("handleComposerKey sends one Enter and takes the default from the browser", () => {
	const { event, actions } = keydown();
	handleComposerKey(event, { composing: false, sendOnEnter: true, completionOpen: false }, actions);
	expect(actions.send).toHaveBeenCalledOnce();
	expect(event.preventDefault).toHaveBeenCalledOnce();
	expect(actions.interrupt).toHaveBeenCalledOnce();
});

test("handleComposerKey leaves a phone's Enter to the browser as a newline", () => {
	const { event, actions } = keydown();
	handleComposerKey(event, { composing: false, sendOnEnter: false, completionOpen: false }, actions);
	expect(actions.send).not.toHaveBeenCalled();
	expect(event.preventDefault).not.toHaveBeenCalled();
});

test("handleComposerKey lets the popup take Enter, and lets the composer's own state mark a composition", () => {
	const popup = keydown();
	popup.takePopup();
	handleComposerKey(popup.event, { composing: false, sendOnEnter: true, completionOpen: true }, popup.actions);
	expect(popup.actions.acceptCompletion).toHaveBeenCalled();
	expect(popup.actions.send).not.toHaveBeenCalled();

	const composing = keydown();
	handleComposerKey(composing.event, { composing: true, sendOnEnter: true, completionOpen: false }, composing.actions);
	expect(composing.actions.send).not.toHaveBeenCalled();
	expect(composing.actions.interrupt).not.toHaveBeenCalled();
	expect(composing.event.preventDefault).not.toHaveBeenCalled();
});

test("handleComposerKey hands every other key to the popup, then ends dictation", () => {
	const unhandled = keydown({ key: "ArrowDown" });
	handleComposerKey(unhandled.event, { composing: false, sendOnEnter: true, completionOpen: true }, unhandled.actions);
	// The popup is asked first and declines, so dictation ends.
	expect(unhandled.actions.acceptCompletion).toHaveBeenCalledOnce();
	expect(unhandled.actions.interrupt).toHaveBeenCalledOnce();
	expect(unhandled.event.preventDefault).not.toHaveBeenCalled();

	const handled = keydown({ key: "ArrowDown" });
	handled.takePopup();
	handleComposerKey(handled.event, { composing: false, sendOnEnter: true, completionOpen: true }, handled.actions);
	expect(handled.actions.acceptCompletion).toHaveBeenCalled();
	expect(handled.actions.send).not.toHaveBeenCalled();
});

test("handleComposerKey sends when the popup declines Enter on desktop, and never on a phone", () => {
	const declined = keydown();
	handleComposerKey(declined.event, { composing: false, sendOnEnter: true, completionOpen: true }, declined.actions);
	expect(declined.actions.send).toHaveBeenCalledOnce();

	const phone = keydown();
	handleComposerKey(phone.event, { composing: false, sendOnEnter: false, completionOpen: true }, phone.actions);
	expect(phone.actions.send).not.toHaveBeenCalled();
});
