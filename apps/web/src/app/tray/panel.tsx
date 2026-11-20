import { createI18n, resolveLocale } from "@yonder/ui-i18n";
import { ArrowDownToLine, DoorOpen, PanelsTopLeft, Settings } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import {
	observeTrayActivity,
	sendTrayAction,
	type TrayAction,
	type TrayActivity,
	type TraySnapshot,
} from "../../lib/tray-bridge.ts";

const actions = [
	["open-main", "tray.open", PanelsTopLeft],
	["settings", "nav.settings", Settings],
	["check-updates", "me.update.check", ArrowDownToLine],
	["quit", "tray.quit", DoorOpen],
] as const;

export function TrayPanel() {
	const i18n = useMemo(() => createI18n(resolveLocale(document.documentElement.lang)), []);
	const [snapshot, setSnapshot] = useState<TraySnapshot>({ groups: [], unattributed: false });
	const [failure, setFailure] = useState(false);
	const [activityUnavailable, setActivityUnavailable] = useState(false);
	const perform = (action: TrayAction) => {
		setFailure(false);
		void sendTrayAction(action).catch(() => setFailure(true));
	};

	useEffect(() => {
		let disposed = false;
		let cleanup: (() => void) | undefined;
		const unavailable = () => {
			if (!disposed) {
				setSnapshot({ groups: [], unattributed: false });
				setActivityUnavailable(true);
			}
		};
		void observeTrayActivity((snapshot) => {
			if (!disposed) {
				setSnapshot(snapshot);
				setActivityUnavailable(false);
			}
		}, unavailable)
			.then((stop) => {
				if (disposed) stop();
				else cleanup = stop;
			})
			.catch(unavailable);

		return () => {
			disposed = true;
			cleanup?.();
		};
	}, []);

	return (
		<I18nextProvider i18n={i18n}>
			<TrayPanelView
				activity={snapshot.groups}
				unattributed={snapshot.unattributed}
				onAction={perform}
				failure={failure}
				activityUnavailable={activityUnavailable}
			/>
		</I18nextProvider>
	);
}

export function TrayPanelView({
	activity,
	onAction,
	failure = false,
	unattributed = false,
	activityUnavailable = false,
}: {
	activity: TrayActivity;
	onAction: (action: TrayAction) => void;
	failure?: boolean;
	unattributed?: boolean;
	activityUnavailable?: boolean;
}) {
	const { t } = useTranslation();
	const [confirmQuit, setConfirmQuit] = useState(false);
	const cancelButton = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (confirmQuit) cancelButton.current?.focus();
		const handleKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (confirmQuit) setConfirmQuit(false);
			else onAction("dismiss");
		};
		const cancelQuit = () => setConfirmQuit(false);
		window.addEventListener("keydown", handleKey);
		window.addEventListener("blur", cancelQuit);
		return () => {
			window.removeEventListener("keydown", handleKey);
			window.removeEventListener("blur", cancelQuit);
		};
	}, [confirmQuit, onAction]);
	const actionStyle =
		"flex w-full min-w-0 items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-start text-body hover:bg-[var(--color-bg-hover)]";
	return (
		<main className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-[var(--color-bg-surface)]">
			<header className="grid shrink-0 grid-cols-2 items-center border-b border-[var(--color-border-default)] px-3 py-2">
				<h1 className="truncate text-body font-semibold">{t("tray.title")}</h1>
				<p aria-live="polite" className="truncate text-caption text-[var(--color-text-secondary)]">
					{failure ? t("tray.failure") : ""}
				</p>
			</header>
			{confirmQuit ? (
				<div
					role="alertdialog"
					aria-labelledby="tray-quit-title"
					aria-describedby="tray-quit-warning"
					aria-modal="true"
					className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3"
				>
					<h2 id="tray-quit-title" className="text-body font-semibold">
						{t("tray.quitTitle")}
					</h2>
					<p id="tray-quit-warning" className="mt-2 text-caption text-[var(--color-text-secondary)]">
						{t("tray.quitWarning")}
					</p>
					<div className="mt-auto grid grid-cols-2 gap-2 pt-3">
						<button ref={cancelButton} type="button" className={actionStyle} onClick={() => setConfirmQuit(false)}>
							{t("app.cancel")}
						</button>
						<button
							type="button"
							className={`${actionStyle} text-[var(--color-danger)]`}
							onClick={() => onAction("quit")}
						>
							{t("tray.quit")}
						</button>
					</div>
				</div>
			) : (
				<div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] px-3 py-2">
					{activity.length === 0 ? (
						<p className="truncate py-3 text-caption text-[var(--color-text-secondary)]">
							{t(activityUnavailable ? "tray.unavailable" : unattributed ? "tray.unattributed" : "tray.empty")}
						</p>
					) : (
						activity.map(({ botId, botName, entries }) => (
							<section key={botId} className="min-w-0 py-1">
								<h2 className="truncate text-caption font-semibold text-[var(--color-text-secondary)]" title={botName}>
									{botName}
								</h2>
								<ul>
									{entries.map(({ id, conversationTitle, activity: detail }) => (
										<li key={id} className="grid min-w-0 grid-cols-2 gap-2 py-1 text-body">
											<span className="truncate" title={conversationTitle}>
												{conversationTitle}
											</span>
											<span className="truncate text-[var(--color-text-secondary)]" title={detail}>
												{detail}
											</span>
										</li>
									))}
								</ul>
							</section>
						))
					)}
					{unattributed && activity.length > 0 ? (
						<p className="truncate py-1 text-caption text-[var(--color-text-secondary)]">{t("tray.unattributed")}</p>
					) : null}
				</div>
			)}
			{!confirmQuit ? (
				<footer className="shrink-0 border-t border-[var(--color-border-default)] p-2">
					{actions.map(([action, label, Icon]) => (
						<button
							key={action}
							type="button"
							className={actionStyle}
							onClick={() => (action === "quit" ? setConfirmQuit(true) : onAction(action))}
						>
							<Icon size={16} className="shrink-0" aria-hidden="true" />
							<span className="truncate">{t(label)}</span>
						</button>
					))}
				</footer>
			) : null}
		</main>
	);
}
