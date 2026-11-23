/**
 * Shown while the first refresh decides whether a session exists. Neutral on purpose: neither the
 * app nor the sign-in screen, so a returning user sees no flash of either.
 */
export function Splash() {
	return (
		<div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg-base)]">
			<span
				role="status"
				aria-label="loading"
				className="size-6 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-[var(--color-accent)]"
			/>
		</div>
	);
}
