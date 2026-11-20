import { FormSection, Segmented } from "@yonder/ui-components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isDesktopExperience, isDesktopShell } from "../lib/platform.ts";

type CloseBehavior = "tray" | "quit";

export function DesktopCloseBehavior() {
	const supported =
		isDesktopShell() && isDesktopExperience() && /Macintosh|Mac OS X|Windows/i.test(navigator.userAgent);
	return supported ? <DesktopCloseBehaviorSetting /> : null;
}

function DesktopCloseBehaviorSetting() {
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
