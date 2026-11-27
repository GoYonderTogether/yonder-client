import type { ConnectorDefinition, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { useConnectorActions } from "@yonder/ui-data";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceDisplayName } from "../components/device-display-name.ts";
import { ConnectorArtwork, connectorPresentation } from "./connector-card.tsx";
import { canConfigureConnector, type LocalFilesAdapter } from "./local-files-adapter.ts";

const fileIds = ["local-files", "computer-control"] as const;
type FileId = (typeof fileIds)[number];
export function isFileConnector(definition: ConnectorDefinition) {
	return fileIds.some((id) => id === definition.id);
}

type Props = {
	device: DeviceSummary;
	definitions: readonly ConnectorDefinition[];
	instances: readonly ConnectorInstance[];
	localFiles?: LocalFilesAdapter | undefined;
};
const card = "rounded-[var(--radius-card)] bg-[var(--color-bg-card)]";

export function ComputerAccessCard({
	instances,
	onOpen,
	onLegacy,
}: Pick<Props, "instances"> & { onOpen: () => void; onLegacy: (instance: ConnectorInstance) => void }) {
	const { t } = useTranslation();
	return (
		<section className={card}>
			<button
				type="button"
				onClick={onOpen}
				className="flex w-full items-center gap-[var(--spacing-3)] rounded-[var(--radius-card)] p-[var(--spacing-3)] text-start focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
			>
				<ConnectorArtwork id="computer-control" />
				<span className="text-body font-medium">{t("connectors.computerAccess.name")}</span>
			</button>
			{instances
				.filter((item) => item.scope === "folder")
				.map((item) => (
					<div
						key={item.id}
						className="flex items-center justify-between gap-[var(--spacing-3)] border-t border-[var(--color-border-subtle)] px-[var(--spacing-3)] py-[var(--spacing-2)]"
					>
						<span className="min-w-0 truncate text-body">{item.name}</span>
						<Button
							size="sm"
							variant="ghost"
							aria-label={`${t("connectors.manage")} ${item.name}`}
							onClick={() => onLegacy(item)}
						>
							{t("connectors.manage")}
						</Button>
					</div>
				))}
		</section>
	);
}

export function ComputerAccessPanel({
	device,
	definitions,
	instances,
	localFiles,
	onClose,
	onTry,
}: Props & {
	onClose: () => void;
	onTry?: ((draft: string) => void) | undefined;
}) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const actions = useConnectorActions();
	const [edits, setEdits] = useState<Partial<Record<FileId, boolean>>>({});
	const [failed, setFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	const active = useRef(true);
	const applying = useRef(false);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	const available = fileIds.flatMap((id) => {
		const definition = definitions.find((item) => item.id === id);
		if (!definition) return [];
		const grants = instances.filter((item) => item.deviceId === device.id && item.connectorId === id);
		const local = canConfigureConnector(device, definition, localFiles);
		const canEnable = local && device.status === "online";
		return [{ id, grants, local, canEnable }];
	});
	const changes = available.filter(({ id, grants, canEnable }) =>
		edits[id] === true ? canEnable && !grants.length : edits[id] === false && grants.length > 0,
	);
	const canEnable = available.some((item) => item.canEnable);
	const editable = canEnable || available.some((item) => item.grants.length > 0);
	const trial =
		onTry &&
		available.find(
			({ grants }) => device.status === "online" && grants.some((g) => g.scope === "device" && g.status === "online"),
		);

	function finish() {
		active.current = false;
		onClose();
	}

	async function apply() {
		if (applying.current || !changes.length) return;
		applying.current = true;
		setBusy(true);
		setFailed(false);
		try {
			// Clear access before adding new access. The existing API stores these as separate grants.
			for (const { id, grants, local } of [...changes].sort((a, b) => Number(edits[a.id]) - Number(edits[b.id]))) {
				if (!active.current) return;
				if (!edits[id]) {
					for (const grant of grants) {
						if (local) await localFiles?.revoke(grant.id);
						await actions.remove.mutateAsync(grant.id);
					}
				} else {
					if (!localFiles) return;
					const saved = await actions.create.mutateAsync({
						connectorId: id,
						deviceId: device.id,
						name: device.name,
						scope: "device",
						capabilities: { fileTools: id === "computer-control" },
					});
					try {
						if (!active.current) throw new Error("cancelled");
						await localFiles.authorize(saved);
						if (!active.current) throw new Error("cancelled");
					} catch (error) {
						await Promise.allSettled([localFiles.revoke(saved.id), actions.remove.mutateAsync(saved.id)]);
						throw error;
					}
				}
				if (active.current) setEdits((previous) => ({ ...previous, [id]: undefined }));
			}
		} catch {
			if (active.current) setFailed(true);
		} finally {
			applying.current = false;
			if (active.current) setBusy(false);
		}
	}

	return (
		<Overlay
			open
			title={t("connectors.computerAccess.name")}
			mode={mode}
			mobilePresentation="large-sheet"
			closeLabel={t("app.close")}
			onClose={finish}
		>
			<div className="flex flex-col gap-[var(--spacing-4)] p-[var(--spacing-4)]">
				<p className="text-body font-medium">{deviceDisplayName(device)}</p>
				<div className={`${card} divide-y divide-[var(--color-border-subtle)]`}>
					{available.map(({ id, grants, canEnable }) => (
						<label
							key={id}
							className="flex items-center justify-between gap-[var(--spacing-3)] px-[var(--spacing-4)] py-[var(--spacing-3)]"
						>
							<span>{t(`connectors.${connectorPresentation[id].key}.name`)}</span>
							<input
								type="checkbox"
								checked={edits[id] ?? Boolean(grants.length)}
								disabled={(!canEnable && !grants.length) || busy}
								className="size-[var(--spacing-5)] accent-[var(--color-accent)]"
								onChange={(event) => {
									const checked = event.currentTarget.checked;
									setEdits((previous) => ({ ...previous, [id]: checked }));
								}}
							/>
						</label>
					))}
				</div>
				{failed || !canEnable ? (
					<p role="status" className="text-caption text-[var(--color-text-secondary)]">
						{failed
							? t("connectors.computerAccess.saveFailed")
							: device.status === "offline"
								? t("connectors.requestDeviceOffline")
								: t("connectors.onDevice", { device: deviceDisplayName(device) })}
					</p>
				) : null}
				{editable ? (
					<Button variant="primary" disabled={!changes.length || busy} loading={busy} onClick={() => void apply()}>
						{t("connectors.computerAccess.apply")}
					</Button>
				) : null}
				{trial && !changes.length && !failed && !busy ? (
					<Button
						variant="ghost"
						onClick={() => {
							finish();
							onTry(
								t(`connectors.${connectorPresentation[trial.id].key}.trial`, { device: deviceDisplayName(device) }),
							);
						}}
					>
						{t("connectors.sheet.try")}
					</Button>
				) : null}
			</div>
		</Overlay>
	);
}
