import { ArrowUp } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useUpdater } from "./provider.tsx";
import type { Updater } from "./state.ts";

export function UpdateReadyButton() {
	const updater = useUpdater();
	return updater?.platform === "desktop" ? <UpdateReadyButtonView updater={updater} /> : null;
}

export function UpdateReadyButtonView({ updater }: { updater: Updater }) {
	const { t } = useTranslation();
	const state = useSyncExternalStore(updater.subscribe, updater.getSnapshot, updater.getSnapshot);
	if (
		updater.platform !== "desktop" ||
		!(state.status === "ready" || (state.status === "error" && state.error === "install"))
	)
		return null;
	const label = `${t("me.update.ready", { version: state.version })} · ${t("me.update.restart")}`;
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className="flex size-11 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-text-inverse)] hover:bg-[var(--color-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
			onClick={() => {
				if (window.confirm(t("me.update.restartConfirm"))) void updater.install();
			}}
		>
			<ArrowUp size={20} aria-hidden="true" />
		</button>
	);
}
