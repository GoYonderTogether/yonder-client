import { Button, InlineError } from "@yonder/ui-components";
import type { ReactNode } from "react";
import { useShellChrome } from "../layout/shell-context.tsx";
import type { LayoutMode } from "../responsive/layout-mode.ts";
import { Overlay } from "./overlay.tsx";

export interface ConfirmDialogProps {
	open: boolean;
	title: string;
	/** What will happen, in one or two sentences. A confirmation is the one place prose belongs. */
	body?: ReactNode;
	/** The verb on the button that does it: 删除, 解散, 退出. */
	confirmLabel: string;
	cancelLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
	/** `danger` (default) for anything destructive; `primary` for a confirmation that loses nothing. */
	tone?: "danger" | "primary";
	/** The action is running: the confirm button spins, cancel and dismiss are blocked. */
	busy?: boolean;
	/** The real reason the action failed, shown above the buttons. */
	error?: ReactNode;
	/** Defaults to the shell's layout mode. */
	mode?: LayoutMode;
}

/**
 * Every confirmation goes through here instead of `window.confirm` or an inline expanding block:
 * a centred dialog on a desktop, a bottom sheet on a phone (11 第五节), cancel on the left and the
 * action on the right.
 */
export function ConfirmDialog({
	open,
	title,
	body,
	confirmLabel,
	cancelLabel,
	onConfirm,
	onCancel,
	tone = "danger",
	busy = false,
	error,
	mode,
}: ConfirmDialogProps) {
	const shell = useShellChrome();
	const close = () => {
		if (!busy) onCancel();
	};
	return (
		<Overlay
			open={open}
			onClose={close}
			title={title}
			mode={mode ?? shell.mode}
			closeLabel={cancelLabel}
			mobilePresentation="sheet"
			padded
			footer={
				<>
					<Button onClick={close} disabled={busy}>
						{cancelLabel}
					</Button>
					<Button variant={tone} onClick={onConfirm} loading={busy}>
						{confirmLabel}
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-[var(--spacing-3)]">
				{body ? <div className="text-body text-[var(--color-text-secondary)]">{body}</div> : null}
				{error ? <InlineError>{error}</InlineError> : null}
			</div>
		</Overlay>
	);
}
