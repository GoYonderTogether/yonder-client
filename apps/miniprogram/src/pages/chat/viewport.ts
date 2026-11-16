/** Keyboard may already have reduced the host window; only subtract the remaining overlay. */
export function chatViewportHeight(
	windowHeight: number,
	baselineHeight: number,
	headerHeight: number,
	safeBottom: number,
	keyboardHeight: number,
): number {
	const shrink = Math.max(0, baselineHeight - windowHeight);
	const keyboardOverlay = Math.max(0, keyboardHeight - shrink);
	return Math.max(0, windowHeight - headerHeight - keyboardOverlay - (keyboardHeight > 0 ? 0 : safeBottom));
}

/** WeChat may return an empty safeArea; that is absence of an inset, not an inset of the whole screen. */
export function safeBottomInset(screenHeight: number, bottom: number | undefined): number {
	if (!Number.isFinite(screenHeight) || screenHeight <= 0 || !bottom || bottom < 0 || bottom > screenHeight) return 0;
	return screenHeight - bottom;
}
