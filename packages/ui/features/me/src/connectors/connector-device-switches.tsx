import type { ConnectorId, ConnectorInstance, DeviceSummary } from "@yonder/protocol";
import { ListSwitch } from "@yonder/ui-components";
import { useConnectorActions } from "@yonder/ui-data";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceDisplayName } from "../components/device-display-name.ts";
import { connectorPresentation, desktopPresentation, terminalPresentation } from "./connector-card.tsx";
import { DESKTOP_MEMBER, type MemberDefinition, masterState, TERMINAL_MEMBER } from "./connector-groups.ts";
import { canConfigureConnector, type LocalFilesAdapter } from "./local-files-adapter.ts";

export interface DeviceSwitchesProps {
	/** The catalog entries drawn as one connector; one entry means no expansion. */
	members: readonly MemberDefinition[];
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
	/**
	 * The grant behind one member. The terminal and desktop control are not connectors: each is a
	 * capability of `computer-control`, so its switch reads that connection's grant and leaves the
	 * others on when it turns its own capability off — turning one capability off must not revoke
	 * another.
	 */
	const grantOf = (member: MemberDefinition) => {
		if (member.id === TERMINAL_MEMBER)
			return instances.find(
				(item) => item.connectorId === "computer-control" && item.scope === "device" && item.capabilities.terminal,
			);
		if (member.id === DESKTOP_MEMBER)
			return instances.find(
				(item) => item.connectorId === "computer-control" && item.scope === "device" && item.capabilities.desktop,
			);
		return instances.find((item) => item.connectorId === member.id && item.scope === "device");
	};
	const canGrant = (member: MemberDefinition) =>
		device.status === "online" && canConfigureConnector(device, member, localFiles);
	const addable = members.filter((member) => !grantOf(member) && canGrant(member));
	// The master switch never touches the terminal or desktop control (see `masterState`): each is
	// granted or revoked only by the row that explains what it allows.
	const sweepable = (member: MemberDefinition) => member.id !== TERMINAL_MEMBER && member.id !== DESKTOP_MEMBER;

	async function enable(member: MemberDefinition) {
		if (!localFiles) throw new Error("permission_denied");
		// The system's own permission prompt comes first; a refusal never creates a grant.
		if (member.id.startsWith("apple-") && localFiles.prepare) await localFiles.prepare(member.id as ConnectorId);
		if (member.id === TERMINAL_MEMBER || member.id === DESKTOP_MEMBER) {
			// An existing `computer-control` grant (whatever its other capabilities) is widened in place;
			// there is no second connection for a capability of the same connector.
			const capability = member.id === TERMINAL_MEMBER ? "terminal" : "desktop";
			const existing = instances.find((item) => item.connectorId === "computer-control" && item.scope === "device");
			if (existing) {
				const saved = await actions.update.mutateAsync({
					id: existing.id,
					expectedRevision: existing.revision,
					capabilities: { ...existing.capabilities, [capability]: true },
				});
				try {
					await localFiles.authorize(saved);
				} catch (failure) {
					// Put the grant back the way it was: the device refused the capability, so the
					// server must not keep claiming it.
					await actions.update
						.mutateAsync({
							id: existing.id,
							expectedRevision: saved.revision,
							capabilities: existing.capabilities,
						})
						.catch(() => {});
					throw failure;
				}
				return;
			}
			const saved = await actions.create.mutateAsync({
				connectorId: "computer-control",
				deviceId: device.id,
				name: device.name,
				scope: "device",
				capabilities: {
					fileTools: false,
					terminal: member.id === TERMINAL_MEMBER,
					desktop: member.id === DESKTOP_MEMBER,
				},
			});
			try {
				await localFiles.authorize(saved);
			} catch (failure) {
				await Promise.allSettled([
					actions.remove.mutateAsync(saved.id),
					localFiles.revoke(saved.id, "computer-control"),
				]);
				throw failure;
			}
			return;
		}
		const saved = await actions.create.mutateAsync({
			connectorId: member.id,
			deviceId: device.id,
			name: device.name,
			scope: "device",
			capabilities: { fileTools: member.id === "computer-control", terminal: false, desktop: false },
		});
		try {
			await localFiles.authorize(saved);
		} catch (failure) {
			await Promise.allSettled([actions.remove.mutateAsync(saved.id), localFiles.revoke(saved.id, member.id)]);
			throw failure;
		}
	}

	function disable(member: MemberDefinition) {
		const grant = grantOf(member);
		if (!grant) return;
		if (member.id === TERMINAL_MEMBER || member.id === DESKTOP_MEMBER) {
			// Only this capability goes off; the same grant's file tools, terminal and the rest of the
			// connection stay.
			const capability = member.id === TERMINAL_MEMBER ? "terminal" : "desktop";
			return actions.update
				.mutateAsync({
					id: grant.id,
					expectedRevision: grant.revision,
					capabilities: { ...grant.capabilities, [capability]: false },
				})
				.then(async (saved) => {
					if (device.current && localFiles) await localFiles.authorize(saved);
				});
		}
		return (async () => {
			const local =
				device.current && localFiles ? localFiles.revoke(grant.id, member.id as ConnectorId) : Promise.resolve();
			const results = await Promise.allSettled([local, actions.remove.mutateAsync(grant.id)]);
			if (results.some((result) => result.status === "rejected")) throw new Error("disconnect_failed");
		})();
	}

	async function run(id: string, targets: readonly MemberDefinition[], on: boolean) {
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

	const deviceLine = `${t(`me.devices.platforms.${device.platform}`)}${device.current ? ` · ${t("me.account.sessionCurrent")}` : ""}${device.status === "offline" ? ` · ${t("me.devices.offline")}` : ""}`;

	function errorOf(id: string) {
		if (error?.id !== id) return undefined;
		const settings =
			error.key === "connectors.systemPermissionDenied" && device.current && localFiles?.openPermissionSettings;
		return (
			<>
				{t(error.key)}
				{settings ? (
					<button
						type="button"
						className="ms-[var(--spacing-2)] text-[var(--color-accent-text)] underline"
						onClick={() => {
							const target = members.find((member) => member.id.startsWith("apple-"));
							if (target) void localFiles.openPermissionSettings?.(target.id as ConnectorId).catch(() => {});
						}}
					>
						{t("connectors.openSystemSettings")}
					</button>
				) : null}
			</>
		);
	}

	/** One capability's switch. Alone in its connector, the row stands for the device and carries its name. */
	function memberSwitch(member: MemberDefinition, alone = false) {
		const key =
			member.id === TERMINAL_MEMBER
				? terminalPresentation.key
				: member.id === DESKTOP_MEMBER
					? desktopPresentation.key
					: connectorPresentation[member.id as ConnectorId].key;
		const granted = Boolean(grantOf(member));
		const hint =
			!granted && !canGrant(member) && device.status === "online"
				? t("connectors.onDevice", { device: deviceDisplayName(device) })
				: undefined;
		return (
			<ListSwitch
				key={member.id}
				title={alone ? deviceDisplayName(device) : t(`connectors.${key}.name`)}
				// The terminal's and desktop control's rows carry the full consequence all the time, not
				// only while off: each is a capability that lets the Bot act on the device without asking
				// again (TOOLS-V3 §4, desktop control design §5).
				subtitle={hint ?? (alone ? deviceLine : t(`connectors.${key}.description`))}
				checked={granted}
				busy={busy === member.id}
				disabled={busy !== null || (!granted && !canGrant(member))}
				error={errorOf(member.id)}
				onChange={(on) => void run(member.id, [member], on)}
			/>
		);
	}

	const only = members.length === 1 ? members[0] : undefined;
	if (only) return memberSwitch(only, true);

	const on = state !== "on" && addable.some(sweepable);
	const targets = on ? addable.filter(sweepable) : members.filter((member) => grantOf(member) && sweepable(member));
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
						<span className="truncate text-caption text-[var(--color-text-tertiary)]">{deviceLine}</span>
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
					disabled={busy !== null || (state === "off" && !addable.some(sweepable))}
					onChange={() => void run("master", targets, on)}
					className={SWITCH}
				/>
			</div>
			{error?.id === "master" ? (
				<p role="alert" className="px-[var(--spacing-4)] pb-[var(--spacing-2)] text-caption text-[var(--color-danger)]">
					{errorOf("master")}
				</p>
			) : null}
			{open ? (
				<ul id={panel} className="ms-[var(--spacing-4)] border-t border-dashed border-[var(--color-border)]">
					{members.map((member) => memberSwitch(member))}
				</ul>
			) : null}
		</li>
	);
}
