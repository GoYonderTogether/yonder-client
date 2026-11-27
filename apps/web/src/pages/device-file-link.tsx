import { type DeviceFileReference, deviceFileName } from "@yonder/chat-model";
import type { ConnectorInstance } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { useConnectors } from "@yonder/ui-data";
import { Overlay, useOptionalSidePanel, useShellChrome } from "@yonder/ui-shell";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceFilePage } from "./device-file-reader.tsx";

export function DeviceFileLink({ reference, label }: { reference: DeviceFileReference; label?: ReactNode }) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const side = useOptionalSidePanel();
	const query = useConnectors({ enabled: Boolean(side) });
	const [choosing, setChoosing] = useState(false);
	const candidates = (query.data?.items ?? []).filter(
		(source) =>
			source.connectorId === "local-files" &&
			(reference.connectionId ? source.id === reference.connectionId : source.scope === "device"),
	);
	const source = candidates.length === 1 ? candidates[0] : undefined;
	const name = label ?? deviceFileName(reference.path);
	if (!side) return <>{name}</>;
	function open(selected: ConnectorInstance) {
		setChoosing(false);
		side?.open(deviceFilePage(selected, reference.path));
	}
	return (
		<>
			<button
				type="button"
				className="message-content-link"
				data-device-file-link
				title={reference.path}
				disabled={query.isPending}
				onClick={() => {
					if (source) open(source);
					else setChoosing(true);
				}}
			>
				{name}
			</button>
			{choosing ? (
				<Overlay
					open
					onClose={() => setChoosing(false)}
					title={t("deviceFiles.chooseSource")}
					mode={mode}
					size="small"
					closeLabel={t("app.close")}
					mobileBackLabel={t("app.back")}
				>
					<div className="flex flex-col gap-[var(--spacing-2)] p-[var(--spacing-4)]">
						{candidates.map((option) => (
							<Button type="button" key={option.id} variant="secondary" onClick={() => open(option)}>
								{option.deviceName}
							</Button>
						))}
						{!candidates.length ? (
							<p role="status">
								{t(query.isPending ? "app.loading" : query.isError ? "deviceFiles.readFailed" : "deviceFiles.noSource")}
							</p>
						) : null}
						{query.isError ? (
							<Button type="button" variant="link" onClick={() => void query.refetch()}>
								{t("app.retry")}
							</Button>
						) : null}
					</div>
				</Overlay>
			) : null}
		</>
	);
}
