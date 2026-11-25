import { ConfirmDialog } from "@yonder/ui-shell";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { Updater } from "./state.ts";

/**
 * WKWebView does not provide window.confirm; keep consent inside the app.
 *
 * Releases land faster than a user gets around to restarting, so confirming re-reads the release
 * feed before anything is replaced on disk. If a newer build was published, it is staged and the
 * title moves to it: the dialog stays open, and the restart waits for a deliberate second click on
 * the version now on screen. Otherwise the restart installs exactly the version in the title.
 */
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
	const [confirming, setConfirming] = useState(false);
	const busy = state.status === "installing" || confirming;
	const checking = confirming && state.status === "checking";
	const version = state.version ?? "";
	return (
		<ConfirmDialog
			open={open}
			title={t("me.update.restartVersion", { version })}
			body={t(checking ? "me.update.restartChecking" : "me.update.restartConfirm")}
			confirmLabel={t("me.update.restart")}
			cancelLabel={t("app.cancel")}
			closeLabel={t("app.close")}
			backLabel={t("app.back")}
			busy={busy}
			error={state.status === "error" && state.error === "install" ? t("me.update.installFailed") : null}
			onCancel={() => {
				if (!busy) onCancel();
			}}
			onConfirm={() => {
				if (busy) return;
				setConfirming(true);
				void (async () => {
					try {
						await updater.check();
						const staged = updater.getSnapshot().version;
						if (!staged || staged !== version) return;
						await updater.install(staged);
					} finally {
						setConfirming(false);
					}
				})();
			}}
		/>
	);
}
