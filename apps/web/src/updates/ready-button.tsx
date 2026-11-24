import { AlertCircle, ArrowUp, LoaderCircle } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useUpdater } from "./provider.tsx";
import { RestartUpdateDialog } from "./restart-dialog.tsx";
import type { Updater } from "./state.ts";

export function UpdateReadyButton() {
	const updater = useUpdater();
	return updater?.platform === "desktop" ? <UpdateReadyButtonView updater={updater} /> : null;
}

export function UpdateReadyButtonView({ updater }: { updater: Updater }) {
	const [confirming, setConfirming] = useState(false);
	return (
		<>
			<UpdateReadyButtonViewContent updater={updater} onRestart={() => setConfirming(true)} />
			<RestartUpdateDialog updater={updater} open={confirming} onCancel={() => setConfirming(false)} />
		</>
	);
}

function UpdateReadyButtonViewContent({ updater, onRestart }: { updater: Updater; onRestart: () => void }) {
	const { t } = useTranslation();
	const state = useSyncExternalStore(updater.subscribe, updater.getSnapshot, updater.getSnapshot);
	if (updater.platform !== "desktop" || state.notice) return null;
	if (state.status === "downloading") {
		const percent = state.progress;
		const label = percent === undefined ? t("me.update.downloading") : t("me.update.progress", { percent });
		return (
			<div className="flex size-11 items-center justify-center" title={label}>
				<div
					role="progressbar"
					aria-label={label}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={percent}
					className="relative flex size-[var(--control-sm)] items-center justify-center rounded-full bg-[var(--color-update-download-bg)] text-micro font-medium text-[var(--color-update-download-fg)]"
				>
					{percent === undefined ? (
						<LoaderCircle size={20} className="motion-safe:animate-spin" aria-hidden="true" />
					) : (
						<>
							<svg viewBox="0 0 32 32" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
								<circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.15" />
								<circle
									cx="16"
									cy="16"
									r="15"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									pathLength="100"
									strokeDasharray={`${percent} 100`}
								/>
							</svg>
							<span>{percent}%</span>
						</>
					)}
				</div>
			</div>
		);
	}
	if (state.status === "installing" || (state.status === "error" && state.error !== "install")) {
		const label = t(state.status === "installing" ? "me.update.installing" : `me.update.${state.error}Failed`);
		return (
			<div role="status" title={label} className="flex size-11 items-center justify-center text-[var(--color-accent)]">
				{state.status === "installing" ? (
					<LoaderCircle size={20} className="motion-safe:animate-spin" aria-hidden="true" />
				) : (
					<AlertCircle size={20} className="text-[var(--color-danger)]" aria-hidden="true" />
				)}
				<span className="sr-only">{label}</span>
			</div>
		);
	}
	if (!(state.status === "ready" || (state.status === "error" && state.error === "install"))) return null;
	const label =
		state.status === "error"
			? `${t("me.update.installFailed")} · ${t("me.update.restart")}`
			: `${t("me.update.ready", { version: state.version })} · ${t("me.update.restart")}`;
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className="group flex size-11 items-center justify-center rounded-full text-[var(--color-text-inverse)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
			onClick={() => {
				onRestart();
			}}
		>
			<span className="flex size-[var(--control-sm)] items-center justify-center rounded-full bg-[var(--color-accent)] group-hover:bg-[var(--color-accent-hover)]">
				<ArrowUp size={20} strokeWidth={1.7} aria-hidden="true" />
			</span>
		</button>
	);
}
