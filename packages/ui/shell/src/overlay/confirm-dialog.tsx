import { Button, cn } from "@yonder/ui-components";
import { Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useShellChrome } from "../layout/shell-context.tsx";
import { Overlay } from "./overlay.tsx";

export interface ConfirmDialogProps {
	open: boolean;
	/** The question, naming what it is about: 删除「周报」？ */
	title: string;
	/** The consequence in a sentence: 删除后无法恢复。 */
	body: ReactNode;
	/** The word on the button that does it, e.g. 删除, 解除连接. */
	confirmLabel: string;
	cancelLabel: string;
	closeLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
	/** `danger` (default) is for what cannot be undone; `primary` is a plain yes, such as a restart. */
	tone?: "danger" | "primary";
	busy?: boolean | undefined;
	error?: string | null | undefined;
}

/**
 * Every destructive or hard-to-undo action asks here first (docs/design-system.md §五): a small
 * centred dialog on a desktop and a bottom sheet on a phone, from the shell's own overlay, never an
 * inline card. Icon, question, consequence, then two equal buttons; Esc, the scrim and Cancel all
 * leave through `onCancel`.
 */
export function ConfirmDialog({
	open,
	title,
	body,
	confirmLabel,
	cancelLabel,
	closeLabel,
	onConfirm,
	onCancel,
	tone = "danger",
	busy = false,
	error,
}: ConfirmDialogProps) {
	const { mode } = useShellChrome();
	const danger = tone === "danger";
	const Icon = danger ? TriangleAlert : Info;
	return (
		<Overlay
			open={open}
			onClose={onCancel}
			title={title}
			mode={mode}
			size="alert"
			mobilePresentation="sheet"
			closeLabel={closeLabel}
		>
			<div className="flex flex-col items-center gap-[var(--spacing-4)] p-[var(--spacing-5)] pt-[var(--spacing-6)] text-center [overflow-wrap:anywhere]">
				<span
					aria-hidden="true"
					className={cn(
						"inline-flex size-[var(--control-lg)] items-center justify-center rounded-[var(--radius-full)]",
						danger
							? "bg-[var(--color-danger-subtle)] text-[var(--color-danger)]"
							: "bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]",
					)}
				>
					<Icon className="icon-scaled" size={20} />
				</span>
				<div className="flex flex-col gap-[var(--spacing-2)]">
					<h2 className="text-h3 text-[var(--color-text-primary)]">{title}</h2>
					<div className="text-body text-[var(--color-text-secondary)]">{body}</div>
				</div>
				{error ? (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{error}
					</p>
				) : null}
				<div className="flex w-full flex-wrap gap-[var(--spacing-3)] pt-[var(--spacing-2)]">
					<Button className="min-w-fit flex-1" onClick={onCancel} disabled={busy}>
						{cancelLabel}
					</Button>
					<Button
						className="min-w-fit flex-1"
						variant={danger ? "destructive" : "primary"}
						onClick={onConfirm}
						loading={busy}
					>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</Overlay>
	);
}

export function DiscardChangesDialog(props: Pick<ConfirmDialogProps, "open" | "body" | "onConfirm" | "onCancel">) {
	const { t } = useTranslation();
	return (
		<ConfirmDialog
			{...props}
			title={t("app.discardChangesTitle")}
			confirmLabel={t("app.discardChanges")}
			cancelLabel={t("app.cancel")}
			closeLabel={t("app.close")}
		/>
	);
}
