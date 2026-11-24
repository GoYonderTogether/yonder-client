import { ListGroup, ListRow } from "@yonder/ui-components";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useUpdater } from "./provider.tsx";
import { RestartUpdateDialog } from "./restart-dialog.tsx";
import type { Updater } from "./state.ts";

export function UpdateControls() {
	const updater = useUpdater();
	return updater ? <UpdateControlsView updater={updater} /> : null;
}

export function UpdateControlsView({ updater }: { updater: Updater }) {
	const [confirming, setConfirming] = useState(false);
	return (
		<>
			<UpdateControlsViewContent updater={updater} onRestart={() => setConfirming(true)} />
			<RestartUpdateDialog updater={updater} open={confirming} onCancel={() => setConfirming(false)} />
		</>
	);
}

function UpdateControlsViewContent({ updater, onRestart }: { updater: Updater; onRestart: () => void }) {
	const { t } = useTranslation();
	const state = useSyncExternalStore(updater.subscribe, updater.getSnapshot, updater.getSnapshot);
	const busy = ["checking", "downloading", "installing"].includes(state.status);
	const canInstall =
		updater.platform === "desktop"
			? state.status === "ready" || (state.status === "error" && state.error === "install")
			: state.status === "available" ||
				state.status === "ready" ||
				state.status === "installerOpened" ||
				(state.status === "error" && (state.error === "download" || state.error === "install") && !!state.version);
	let message: string | null = null;
	switch (state.status) {
		case "checking":
			message = t("me.update.checking");
			break;
		case "upToDate":
			message = t("me.update.upToDate");
			break;
		case "available":
			message = t(state.required ? "me.update.required" : "me.update.available", { version: state.version });
			break;
		case "downloading":
			message =
				state.progress === undefined
					? t("me.update.downloading")
					: t("me.update.progress", { percent: state.progress });
			break;
		case "ready":
			message = t("me.update.ready", { version: state.version });
			break;
		case "installing":
			message = t("me.update.installing");
			break;
		case "installerOpened":
			message = t("me.update.installerOpened");
			break;
		case "error":
			message = t(
				updater.platform === "android" && state.error === "download"
					? "me.update.androidInstallFailed"
					: `me.update.${state.error}Failed`,
			);
			break;
	}
	return (
		<ListGroup footer={message ? <span role="status">{message}</span> : undefined}>
			<ListRow title={t("me.update.check")} disabled={busy} onClick={() => void updater.check()} />
			{canInstall ? (
				<ListRow
					title={t(updater.platform === "desktop" ? "me.update.restart" : "me.update.download")}
					onClick={() => {
						if (updater.platform === "desktop") onRestart();
						else void updater.install();
					}}
				/>
			) : null}
		</ListGroup>
	);
}
