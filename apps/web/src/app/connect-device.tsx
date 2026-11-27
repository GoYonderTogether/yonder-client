import type { DeviceSummary } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { type LayoutMode, Overlay } from "@yonder/ui-shell";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

const DEVICE_DOWNLOAD_PLATFORMS = ["macos", "windows", "android", "ios"] as const;

/** Adding a device opens the page that lists one download per system; there is no sheet of share, copy and open buttons. */
export function useConnectDevice(section: "devices" | "connectors", onOpen: (path: string) => void) {
	function onAddDevice(platforms: readonly DeviceSummary["platform"][] = []) {
		const params = new URLSearchParams();
		for (const platform of DEVICE_DOWNLOAD_PLATFORMS) {
			if (platforms.includes(platform)) params.append("platform", platform);
		}
		const query = params.toString();
		onOpen(`/me/${section}/connect${query ? `?${query}` : ""}`);
	}

	return { onAddDevice };
}

export function DownloadBrowserDialog({
	mode,
	onClose,
	onOpen,
	busy = false,
	opening = false,
	children,
}: {
	mode: LayoutMode;
	onClose: () => void;
	onOpen: () => void;
	busy?: boolean;
	opening?: boolean;
	children?: ReactNode;
}) {
	const { t } = useTranslation();
	return (
		<Overlay
			open
			onClose={busy ? () => {} : onClose}
			title={t("landing.openDownloadInBrowser")}
			mode={mode}
			mobilePresentation="sheet"
			closeLabel={t("app.close")}
			size="small"
			footer={
				<>
					<Button disabled={busy} onClick={onClose}>
						{t("app.cancel")}
					</Button>
					<Button variant="primary" disabled={busy} loading={opening} onClick={onOpen}>
						{t("landing.openDownloadConfirm")}
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-[var(--spacing-3)] p-[var(--spacing-5)]">
				<p className="text-body text-[var(--color-text-secondary)]">{t("landing.openDownloadBody")}</p>
				{children}
			</div>
		</Overlay>
	);
}
