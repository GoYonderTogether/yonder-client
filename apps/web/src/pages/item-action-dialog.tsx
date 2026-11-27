import { Button, TextField } from "@yonder/ui-components";
import { ConfirmDialog, Overlay, useShellChrome } from "@yonder/ui-shell";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

export function ItemActionDialog({
	initialTitle,
	action,
	upcoming,
	busy,
	error,
	onClose,
	onConfirm,
}: {
	initialTitle: string;
	action: "rename" | "delete";
	upcoming: boolean;
	busy: boolean;
	error: string | null;
	onClose: () => void;
	onConfirm: (title?: string) => Promise<void>;
}) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const formId = useId();
	const [title, setTitle] = useState(initialTitle);
	const normalized = title.trim().replace(/\s+/gu, " ");
	const valid = normalized.length > 0 && Array.from(normalized).length <= 100 && normalized !== initialTitle;
	if (action === "delete") {
		return (
			<ConfirmDialog
				open
				title={t("tasks.deleteTitle", { title: initialTitle })}
				body={t(upcoming ? "tasks.upcomingDeleteConfirm" : "tasks.itemDeleteConfirm")}
				confirmLabel={t("tasks.delete")}
				cancelLabel={t("app.cancel")}
				closeLabel={t("app.close")}
				busy={busy}
				error={error}
				onCancel={onClose}
				onConfirm={() => void onConfirm()}
			/>
		);
	}
	return (
		<Overlay
			open
			title={t("tasks.itemRename")}
			mode={mode}
			size="small"
			mobilePresentation="sheet"
			closeLabel={t("app.close")}
			onClose={onClose}
			footer={
				<>
					<Button onClick={onClose} disabled={busy}>
						{t("app.cancel")}
					</Button>
					<Button type="submit" form={formId} variant="primary" loading={busy} disabled={!valid}>
						{t("app.save")}
					</Button>
				</>
			}
		>
			<form
				id={formId}
				className="flex flex-col gap-[var(--spacing-4)] p-[var(--spacing-5)]"
				onSubmit={(event) => {
					event.preventDefault();
					if (valid && !busy) void onConfirm(normalized);
				}}
			>
				<TextField
					label={t("tasks.scheduleTitle")}
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					disabled={busy}
					required
				/>
				{error ? (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{error}
					</p>
				) : null}
			</form>
		</Overlay>
	);
}
