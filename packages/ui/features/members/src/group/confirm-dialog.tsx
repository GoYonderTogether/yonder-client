import { Button } from "@yonder/ui-components";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";

export interface ConfirmDialogProps {
	open: boolean;
	title: string;
	body: string;
	/** The word on the button that does it, e.g. 解散. */
	confirmLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
	busy?: boolean | undefined;
}

/**
 * Every destructive group action asks first, in the shell's own overlay so it is a centred dialog on
 * a desktop and a page on a phone without a second implementation (17 第二节).
 */
export function ConfirmDialog({
	open,
	title,
	body,
	confirmLabel,
	onConfirm,
	onCancel,
	busy = false,
}: ConfirmDialogProps) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	return (
		<Overlay open={open} onClose={onCancel} title={title} mode={mode}>
			<div className="flex flex-col gap-[var(--spacing-5)] p-[var(--spacing-5)]">
				<p className="text-body text-[var(--color-text-secondary)]">{body}</p>
				<div className="flex justify-end gap-[var(--spacing-3)]">
					<Button onClick={onCancel} disabled={busy}>
						{t("app.cancel")}
					</Button>
					<Button variant="danger" onClick={onConfirm} loading={busy}>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</Overlay>
	);
}
