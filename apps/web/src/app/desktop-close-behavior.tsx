import { FormSection, ListGroup, ListRow, ListSwitch, Segmented } from "@yonder/ui-components";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { subscribeForeground } from "../lib/foreground.ts";
import {
	type MacLoginItemStatus,
	macLoginItemStatus,
	setMacLoginItem,
	supportsMacPermissions,
} from "../lib/mac-permissions.ts";
import { isDesktopExperience, isDesktopShell } from "../lib/platform.ts";

type CloseBehavior = "tray" | "quit";

export function DesktopCloseBehavior() {
	const supported =
		isDesktopShell() && isDesktopExperience() && /Macintosh|Mac OS X|Windows/i.test(navigator.userAgent);
	return supported ? <DesktopCloseBehaviorSetting mac={supportsMacPermissions()} /> : null;
}

function DesktopCloseBehaviorSetting({ mac }: { mac: boolean }) {
	const { t } = useTranslation();
	const [behavior, setBehavior] = useState<CloseBehavior | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(false);
	useEffect(() => {
		let cancelled = false;
		void import("@tauri-apps/api/core")
			.then(({ invoke }) => invoke<CloseBehavior>("get_desktop_close_behavior"))
			.then((value) => {
				if (!cancelled) setBehavior(value);
			})
			.catch(() => {
				if (!cancelled) setError(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	async function save(next: string) {
		if (busy || next === behavior || (next !== "tray" && next !== "quit")) return;
		setBusy(true);
		setError(false);
		try {
			const { invoke } = await import("@tauri-apps/api/core");
			await invoke("set_desktop_close_behavior", { behavior: next });
			setBehavior(next);
		} catch {
			setError(true);
		} finally {
			setBusy(false);
		}
	}

	if (mac) {
		return (
			<ListGroup title={t("me.macPermissions.startup.title")} footer={t("me.general.closeBehaviorRecording")}>
				<MacLoginItem />
				<ListSwitch
					title={t("me.macPermissions.startup.background")}
					subtitle={t("me.macPermissions.startup.backgroundHint")}
					checked={behavior === "tray"}
					disabled={behavior === null}
					busy={busy}
					onChange={(enabled) => void save(enabled ? "tray" : "quit")}
					error={error ? t("me.general.closeBehaviorError") : undefined}
				/>
			</ListGroup>
		);
	}

	const title = t("me.general.closeBehavior");
	return (
		<FormSection
			title={title}
			footer={
				error ? <span role="alert">{t("me.general.closeBehaviorError")}</span> : t("me.general.closeBehaviorRecording")
			}
		>
			<Segmented
				aria-label={title}
				value={behavior ?? ""}
				disabled={behavior === null || busy}
				size="lg"
				options={[
					{ value: "tray", label: t("me.general.closeToTray") },
					{ value: "quit", label: t("me.general.closeToQuit") },
				]}
				onChange={(next) => void save(next)}
			/>
		</FormSection>
	);
}

function MacLoginItem() {
	const { t } = useTranslation();
	const [status, setStatus] = useState<MacLoginItemStatus | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(false);
	const revision = useRef(0);
	const refresh = useCallback(async () => {
		const current = ++revision.current;
		const actual = await macLoginItemStatus().catch(() => "unavailable" as const);
		if (current === revision.current) setStatus(actual);
	}, []);
	useEffect(() => {
		const stop = subscribeForeground(() => {
			if (document.hasFocus() && document.visibilityState === "visible") void refresh();
		});
		void refresh();
		return () => {
			revision.current++;
			stop();
		};
	}, [refresh]);

	async function save(enabled: boolean) {
		if (busy) return;
		setBusy(true);
		setError(false);
		try {
			const actual = await setMacLoginItem(enabled);
			revision.current++;
			setStatus(actual);
		} catch {
			setError(true);
			await refresh();
		} finally {
			setBusy(false);
		}
	}

	const title = t("me.macPermissions.startup.login");
	if (status === "approval") {
		return (
			<ListRow
				title={title}
				subtitle={error ? t("me.general.closeBehaviorError") : t("me.macPermissions.startup.approve")}
				chevron
				disabled={busy}
				onClick={() => void save(true)}
			/>
		);
	}
	if (!status || status === "unavailable") {
		return (
			<ListRow title={title} subtitle={t(status ? "me.macPermissions.startup.unavailable" : "app.loading")} disabled />
		);
	}
	return (
		<ListSwitch
			title={title}
			checked={status === "enabled"}
			busy={busy}
			onChange={(enabled) => void save(enabled)}
			error={error ? t("me.general.closeBehaviorError") : undefined}
		/>
	);
}
