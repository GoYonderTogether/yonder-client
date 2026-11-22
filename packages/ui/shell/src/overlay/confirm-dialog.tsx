import { Button } from "@yonder/ui-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useShellChrome } from "../layout/shell-context.tsx";
import { Overlay } from "./overlay.tsx";

export interface ConfirmDialogProps {
	open: boolean;
	title: string;
	body: ReactNode;
	/** The word on the button that does it, e.g. 删除, 解除连接. */
	confirmLabel: string;
	cancelLabel: string;
	closeLabel: string;
	backLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
	busy?: boolean | undefined;
	error?: string | null | undefined;
}

/**
 * Every destructive or hard-to-undo action asks here first (docs/settings-forms.md): a centred
 * dialog on a desktop and a page on a phone, from the shell's own overlay, never an inline card.
 */
export function ConfirmDialog({
	open,
	title,
	body,
	confirmLabel,
	cancelLabel,
	closeLabel,
	backLabel,
	onConfirm,
	onCancel,
	busy = false,
	error,
}: ConfirmDialogProps) {
	const { mode } = useShellChrome();
	return (
		<Overlay
			open={open}
			onClose={onCancel}
			title={title}
			mode={mode}
			size="small"
			closeLabel={closeLabel}
			mobileBackLabel={backLabel}
			footer={
				<>
					<Button onClick={onCancel} disabled={busy}>
						{cancelLabel}
					</Button>
					<Button variant="danger" onClick={onConfirm} loading={busy}>
						{confirmLabel}
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-[var(--spacing-5)] p-[var(--spacing-5)] [overflow-wrap:anywhere]">
				<div className="text-body text-[var(--color-text-secondary)]">{body}</div>
				{error ? (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{error}
					</p>
				) : null}
			</div>
		</Overlay>
	);
}

export function DiscardChangesDialog(props: Pick<ConfirmDialogProps, "open" | "body" | "onConfirm" | "onCancel">) {
	const { t } = useTranslation();
	return (
		<ConfirmDialog
			{...props}
			title={t("app.discardChanges")}
			confirmLabel={t("app.discardChanges")}
			cancelLabel={t("app.cancel")}
			closeLabel={t("app.close")}
			backLabel={t("app.back")}
		/>
	);
}
