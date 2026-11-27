import { ConfirmDialog } from "@yonder/ui-shell";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { Updater } from "./state.ts";

/** WKWebView does not provide window.confirm; keep consent inside the app. */
export function RestartUpdateDialog({
	updater,
	open,
	onCancel,
}: {
	updater: Updater;
	open: boolean;
	onCancel: () => void;
}) {
	const { t } = useTranslation();
	const state = useSyncExternalStore(updater.subscribe, updater.getSnapshot, updater.getSnapshot);
	const busy = state.status === "installing";
	return (
		<ConfirmDialog
			open={open}
			title={t("me.update.restart")}
			body={t("me.update.restartConfirm")}
			confirmLabel={t("me.update.restart")}
			cancelLabel={t("app.cancel")}
			closeLabel={t("app.close")}
			tone="primary"
			busy={busy}
			error={state.status === "error" && state.error === "install" ? t("me.update.installFailed") : null}
			onCancel={() => {
				if (!busy) onCancel();
			}}
			onConfirm={() => {
				if (!busy) void updater.install();
			}}
		/>
	);
}
