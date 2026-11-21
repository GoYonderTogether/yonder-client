import { useIsPresent } from "motion/react";

/**
 * The scrim goes the moment its layer is asked to leave. The panel still plays its exit animation,
 * but a dimmed page that outlives the choice that closed it reads as lag.
 */
export function OverlayBackdrop({ onClose, closeLabel }: { onClose: () => void; closeLabel?: string }) {
	if (!useIsPresent()) return null;
	return (
		<button
			type="button"
			data-overlay-backdrop
			aria-label={closeLabel}
			aria-hidden={!closeLabel || undefined}
			onMouseDown={closeLabel ? undefined : (event) => event.preventDefault()}
			onClick={onClose}
			className="absolute inset-0 bg-[var(--color-bg-overlay)]"
			tabIndex={-1}
		/>
	);
}
