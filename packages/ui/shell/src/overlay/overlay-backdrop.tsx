export function OverlayBackdrop({ onClose, closeLabel }: { onClose: () => void; closeLabel?: string }) {
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
