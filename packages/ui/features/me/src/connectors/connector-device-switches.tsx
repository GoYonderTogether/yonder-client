import type { ConnectorDefinition, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { ListSwitch } from "@yonder/ui-components";
import { useConnectorActions } from "@yonder/ui-data";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceDisplayName } from "../components/device-display-name.ts";
import { connectorPresentation } from "./connector-card.tsx";
import { masterState } from "./connector-groups.ts";
import { canConfigureConnector, type LocalFilesAdapter } from "./local-files-adapter.ts";

export interface DeviceSwitchesProps {
	/** The catalog entries drawn as one connector; one entry means no expansion. */
	members: readonly ConnectorDefinition[];
	device: DeviceSummary;
	/** What this device has granted, folder grants included. */
	instances: readonly ConnectorInstance[];
	localFiles?: LocalFilesAdapter | undefined;
}

const SWITCH =
	"relative h-[var(--spacing-6)] w-[var(--spacing-10)] shrink-0 cursor-pointer appearance-none rounded-[var(--radius-full)] bg-[var(--color-border-strong)] transition-colors duration-[var(--duration-fast)] checked:bg-[var(--color-accent)] indeterminate:bg-[var(--color-accent)] indeterminate:opacity-60 disabled:cursor-not-allowed disabled:opacity-60 before:absolute before:top-[var(--spacing-1)] before:left-[var(--spacing-1)] before:size-[var(--spacing-4)] before:rounded-[var(--radius-full)] before:bg-[var(--color-switch-thumb)] before:transition-transform before:duration-[var(--duration-fast)] before:content-[''] checked:before:translate-x-[var(--spacing-4)] indeterminate:before:translate-x-[var(--spacing-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";

/**
 * One device inside a connector: a master switch that grants or revokes every member at once, and
 * under it, opened by tapping the row anywhere but the switch, one switch per member. A connector
 * with a single member is just that switch.
 */
export function DeviceSwitches({ members, device, instances, localFiles }: DeviceSwitchesProps) {
	const { t } = useTranslation();
	const actions = useConnectorActions();
	const panel = useId();
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<{ id: string; key: string } | null>(null);
	const state = masterState(members, instances);
	const grantOf = (member: ConnectorDefinition) =>
		instances.find((item) => item.connectorId === member.id && item.scope === "device");
	const canGrant = (member: ConnectorDefinition) =>
		device.status === "online" && canConfigureConnector(device, member, localFiles);
	const addable = members.filter((member) => !grantOf(member) && canGrant(member));

	async function enable(member: ConnectorDefinition) {
		if (!localFiles) throw new Error("permission_denied");
		// The system's own permission prompt comes first; a refusal never creates a grant.
		if (member.id.startsWith("apple-") && localFiles.prepare) await localFiles.prepare(member.id);
		const saved = await actions.create.mutateAsync({
			connectorId: member.id,
			deviceId: device.id,
			name: device.name,
			scope: "device",
			capabilities: { fileTools: member.id === "computer-control" },
		});
		try {
			await localFiles.authorize(saved);
		} catch (failure) {
			await Promise.allSettled([actions.remove.mutateAsync(saved.id), localFiles.revoke(saved.id, member.id)]);
			throw failure;
		}
	}

	async function disable(member: ConnectorDefinition) {
		const grant = grantOf(member);
		if (!grant) return;
		const local = device.current && localFiles ? localFiles.revoke(grant.id, member.id) : Promise.resolve();
		const results = await Promise.allSettled([local, actions.remove.mutateAsync(grant.id)]);
		if (results.some((result) => result.status === "rejected")) throw new Error("disconnect_failed");
	}

	async function run(id: string, targets: readonly ConnectorDefinition[], on: boolean) {
		if (busy) return;
		setBusy(id);
		setError(null);
		try {
			for (const member of targets) await (on ? enable(member) : disable(member));
		} catch (failure) {
			const code = failure instanceof Error ? failure.message : "";
			setError({
				id,
				key: !on
					? "connectors.disconnectFailed"
					: code === "permission_denied" && targets.some((member) => member.id.startsWith("apple-"))
						? "connectors.systemPermissionDenied"
						: code === "notes_unavailable"
							? "connectors.appleNotes.unavailable"
							: code === "voice_memos_unavailable"
								? "connectors.appleVoiceMemos.unavailable"
								: code === "voice_memos_unsupported"
									? "connectors.appleVoiceMemos.unsupported"
									: "connectors.connectFailed",
			});
		} finally {
			setBusy(null);
		}
	}

	function memberSwitch(member: ConnectorDefinition) {
		const { key } = connectorPresentation[member.id];
		const granted = Boolean(grantOf(member));
		return (
			<ListSwitch
				key={member.id}
				title={t(`connectors.${key}.name`)}
				subtitle={
					!granted && !canGrant(member) && device.status === "online"
						? t("connectors.onDevice", { device: deviceDisplayName(device) })
						: t(`connectors.${key}.description`)
				}
				checked={granted}
				busy={busy === member.id}
				disabled={busy !== null || (!granted && !canGrant(member))}
				error={error?.id === member.id ? t(error.key) : undefined}
				onChange={(on) => void run(member.id, [member], on)}
			/>
		);
	}

	const only = members.length === 1 ? members[0] : undefined;
	if (only) return memberSwitch(only);

	const on = state !== "on" && addable.length > 0;
	const targets = on ? addable : members.filter((member) => grantOf(member));
	return (
		<li className="border-b border-dashed border-[var(--color-border)] last:border-b-0">
			<div className="flex min-h-[var(--row-height)] items-center gap-[var(--spacing-3)] pe-[var(--spacing-4)]">
				<button
					type="button"
					aria-expanded={open}
					aria-controls={panel}
					className="flex min-w-0 flex-1 items-center gap-[var(--spacing-3)] self-stretch px-[var(--spacing-4)] py-[var(--spacing-2)] text-start hover:bg-[var(--color-bg-hover)]"
					onClick={() => setOpen((value) => !value)}
				>
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate text-body text-[var(--color-text-primary)]">{deviceDisplayName(device)}</span>
						<span className="truncate text-caption text-[var(--color-text-tertiary)]">
							{t(`me.devices.platforms.${device.platform}`)}
							{device.current ? ` · ${t("me.account.sessionCurrent")}` : ""}
						</span>
					</span>
					<ChevronDown
						size={16}
						aria-hidden
						className={`shrink-0 text-[var(--color-text-tertiary)] transition-transform ${open ? "rotate-180" : ""}`}
					/>
				</button>
				<input
					type="checkbox"
					role="switch"
					aria-label={deviceDisplayName(device)}
					aria-checked={state === "mixed" ? "mixed" : state === "on"}
					checked={state === "on"}
					ref={(element) => {
						if (element) element.indeterminate = state === "mixed";
					}}
					disabled={busy !== null || (state === "off" && !addable.length)}
					onChange={() => void run("master", targets, on)}
					className={SWITCH}
				/>
			</div>
			{error?.id === "master" ? (
				<p role="alert" className="px-[var(--spacing-4)] pb-[var(--spacing-2)] text-caption text-[var(--color-danger)]">
					{t(error.key)}
				</p>
			) : null}
			{open ? (
				<ul id={panel} className="ms-[var(--spacing-4)] border-t border-dashed border-[var(--color-border)]">
					{members.map(memberSwitch)}
				</ul>
			) : null}
		</li>
	);
}
