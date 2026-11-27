import { ConfirmDialog as ShellConfirmDialog } from "@yonder/ui-shell";
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
	error?: string | null;
}

/** The shell's confirmation with this app's Cancel, Close and Back words filled in. */
export function ConfirmDialog(props: ConfirmDialogProps) {
	const { t } = useTranslation();
	return (
		<ShellConfirmDialog
			{...props}
			cancelLabel={t("app.cancel")}
			closeLabel={t("app.close")}
			backLabel={t("app.back")}
		/>
	);
}
