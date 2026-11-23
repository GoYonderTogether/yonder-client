import { Label, Radio, RadioGroup, ScrollView, Text, View } from "@tarojs/components";
import { ApiError } from "@yonder/api-client";
import { connectorRequestReason } from "@yonder/chat-model";
import { InteractionCard, InteractionCardActions } from "@yonder/chat-presentation";
import type { ConnectorRequestDevice, ConnectorRequestView } from "@yonder/protocol";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui";
import { t } from "../../lib/i18n";
import { api, subscribeEvents, useRealtimeRevision } from "../../lib/runtime";
import { ChatView } from "./host";

function canAllow(row: ConnectorRequestView | undefined) {
	return row?.state === "pending" || row?.state === "failed" || row?.state === "expired";
}

function supported(row: ConnectorRequestView) {
	return (
		row.connectorIds.length > 0 && row.connectorIds.every((id) => id === "local-files" || id === "computer-control")
	);
}

function resultText(row: ConnectorRequestView) {
	switch (row.state) {
		case "pending":
			return "";
		case "dispatched":
			return t("等待设备确认", "Waiting for the device");
		case "granted":
			return t("已授权", "Authorized");
		case "cancelled":
			return t("未允许", "Not allowed");
		case "expired":
			return t("授权已超时", "Authorization expired");
		case "failed":
			return t("授权失败", "Authorization failed");
	}
}

function accessLabel(row: ConnectorRequestView, deviceName?: string) {
	const reads = row.connectorIds.includes("local-files");
	const writes = row.connectorIds.includes("computer-control");
	const scope = reads && writes ? t("读取和修改", "read and modify") : writes ? t("修改", "modify") : t("读取", "read");
	const title = deviceName
		? t(`允许${scope} ${deviceName} 上的文件？`, `Allow access to ${scope} files on ${deviceName}?`)
		: t(`要在哪台设备上${scope}文件？`, `Which device should the Bot ${scope} files on?`);
	const reason = connectorRequestReason(row.reason);
	const coverage = writes
		? reads
			? t(
					"权限覆盖该系统账号可读取、创建、编辑和可恢复删除的全部文件，直至你撤回。",
					"Access includes reading, creating, editing and recoverably deleting every file this system account can access, until you revoke it.",
				)
			: t(
					"权限覆盖该系统账号可创建、编辑和可恢复删除的全部文件，直至你撤回。",
					"Access includes creating, editing and recoverably deleting every file this system account can access, until you revoke it.",
				)
		: t(
				"权限覆盖该系统账号可读取的全部文件，直至你撤回。",
				"Access includes all files this system account can read, until you revoke it.",
			);
	return { title, detail: reason ? `${reason}${t("，", " — ")}${coverage}` : coverage };
}

export function ConnectorRequestCard({ id }: { id: string }) {
	const revision = useRealtimeRevision();
	const [row, setRow] = useState<ConnectorRequestView>();
	const [readError, setReadError] = useState(false);
	const [devices, setDevices] = useState<ConnectorRequestDevice[]>();
	const [deviceError, setDeviceError] = useState(false);
	const [selection, setSelection] = useState<string>();
	const [choosing, setChoosing] = useState(false);
	const [busy, setBusy] = useState(false);
	const [actionError, setActionError] = useState("");
	const pending = useRef(false);
	const reading = useRef(0);
	const [reload, setReload] = useState(0);
	const retry = () => setReload((value) => value + 1);
	useEffect(() => {
		void reload;
		void revision;
		const ticket = ++reading.current;
		setReadError(false);
		void api.connectorRequest(id).then(
			(next) => {
				if (reading.current === ticket) setRow(next);
			},
			() => {
				if (reading.current === ticket) setReadError(true);
			},
		);
		return () => {
			if (reading.current === ticket) reading.current++;
		};
	}, [id, reload, revision]);
	useEffect(
		() =>
			subscribeEvents((event) => {
				if (event.type === "connector_request.updated" && event.request.id === id) {
					reading.current++;
					setRow(event.request);
					setReadError(false);
					setActionError("");
				} else if (event.type === "devices.changed") setReload((value) => value + 1);
			}),
		[id],
	);
	const actionable = canAllow(row);
	useEffect(() => {
		void reload;
		void revision;
		if (!actionable) return;
		let active = true;
		setDeviceError(false);
		void api.connectorRequestDevices(id).then(
			({ items }) => {
				if (active) setDevices(items.filter((device) => device.online && device.supported));
			},
			() => {
				if (active) setDeviceError(true);
			},
		);
		return () => {
			active = false;
		};
	}, [id, actionable, reload, revision]);
	const candidates = devices ?? [];
	const preferred =
		candidates.find((device) => device.id === row?.deviceHintId) ??
		(candidates.length === 1 ? candidates[0] : undefined);
	const selected = deviceError
		? undefined
		: selection === undefined
			? preferred
			: candidates.find(({ id }) => id === selection);
	const unavailable = actionable && (deviceError || (devices !== undefined && candidates.length === 0));
	const showDevices = actionable && !unavailable && candidates.length > 0 && (choosing || !selected);
	const transact = async (action: "allow" | "deny" | "resume") => {
		if (!row || pending.current || (action === "allow" && (!selected || !actionable || !supported(row)))) return;
		pending.current = true;
		setBusy(true);
		setActionError("");
		const ticket = ++reading.current;
		try {
			const updated =
				action === "allow" && selected
					? await api.confirmConnectorRequest(id, { deviceId: selected.id, connectorIds: row.connectorIds })
					: action === "deny"
						? await api.cancelConnectorRequest(id)
						: await api.continueConnectorRequest(id);
			if (reading.current === ticket) setRow(updated);
			else retry();
		} catch (error) {
			if (error instanceof ApiError && ["request_changed", "device_required", "device_offline"].includes(error.code)) {
				setDevices(undefined);
				setSelection(undefined);
				setActionError(t("授权目标有变化，请重新确认。", "The authorization target changed. Confirm again."));
			} else setActionError(t("操作失败，请重试。", "Could not complete the action. Try again."));
			retry();
		} finally {
			pending.current = false;
			setBusy(false);
		}
	};
	const loaded = row && supported(row);
	const access = loaded ? accessLabel(row, actionable ? selected?.name : (row.deviceName ?? undefined)) : undefined;
	const title = access?.title ?? t("连接器授权", "Connector authorization");
	const detail = unavailable
		? t("在可用设备上打开 Yonder 后重试。", "Open Yonder on an available device and try again.")
		: actionable && selected
			? access?.detail
			: undefined;
	const continuation = row?.state === "granted" ? row.continuation : undefined;
	const canResume = continuation === "failed" && !row?.continuationFailure;
	return (
		<InteractionCard
			as={ChatView}
			title={title}
			label={title}
			detail={detail}
			glyph={
				row?.state === "dispatched" ? (
					<View className="mini-chat-spinner" ariaRole="status" ariaLabel={resultText(row)} />
				) : (
					<View className="mini-connector-lock" ariaHidden />
				)
			}
		>
			{!loaded ? (
				readError || row ? (
					<InteractionCardActions as={ChatView}>
						<Button secondary onClick={retry}>
							{t("重试", "Retry")}
						</Button>
					</InteractionCardActions>
				) : (
					<View className="mini-chat-spinner" ariaRole="status" ariaLabel={t("加载中…", "Loading…")} />
				)
			) : (
				<>
					{row.state === "granted" || row.state === "cancelled" ? (
						<View className="interaction-card-answer" ariaRole="status">
							<Text className="interaction-card-answer-icon" ariaHidden>
								{row.state === "granted" ? "✓" : "×"}
							</Text>
							<Text>
								{row.continuationFailure ? t("已授权，任务未继续", "Authorized, task did not resume") : resultText(row)}
							</Text>
						</View>
					) : row.state === "failed" || row.state === "expired" ? (
						<Text className="interaction-card-status" ariaRole="status">
							{resultText(row)}
						</Text>
					) : null}
					{actionError && (actionable || canResume || row.state === "dispatched") ? (
						<Text className="mini-error" ariaRole="alert">
							{actionError}
						</Text>
					) : null}
					{showDevices ? (
						<ScrollView
							className="interaction-card-device-list"
							style={{
								height: `calc(var(--control-lg) * ${candidates.length} + var(--spacing-2) * ${candidates.length - 1})`,
							}}
							scrollY
							enhanced
							bounces={false}
							onTouchMove={(event) => event.stopPropagation()}
						>
							<RadioGroup
								className="interaction-card-choices"
								ariaRole="radiogroup"
								ariaLabel={t("选择设备", "Choose a device")}
								onChange={({ detail }) => {
									setSelection(detail.value);
									setChoosing(true);
								}}
							>
								{candidates.map((device) => (
									<Label key={device.id}>
										<View
											className={`interaction-card-choice${selected?.id === device.id ? " interaction-card-choice-selected" : ""}`}
										>
											<Radio value={device.id} checked={selected?.id === device.id} disabled={busy} />
											<Text className="interaction-card-device-name">{device.name}</Text>
										</View>
									</Label>
								))}
							</RadioGroup>
						</ScrollView>
					) : null}
					{actionable || canResume || row.state === "dispatched" ? (
						<InteractionCardActions as={ChatView}>
							{actionable && !devices && !deviceError ? (
								<View className="mini-chat-spinner" ariaRole="status" ariaLabel={t("加载中…", "Loading…")} />
							) : null}
							{row.state === "pending" || row.state === "dispatched" ? (
								<Button secondary disabled={busy} onClick={() => void transact("deny")}>
									{row.state === "dispatched" ? t("取消", "Cancel") : t("不允许", "Don’t allow")}
								</Button>
							) : null}
							{unavailable ? (
								<Button secondary disabled={busy} onClick={retry}>
									{t("重试", "Retry")}
								</Button>
							) : null}
							{actionable && selected && candidates.length > 1 && !showDevices ? (
								<Button secondary disabled={busy} onClick={() => setChoosing(true)}>
									{t("更换设备", "Change device")}
								</Button>
							) : null}
							{actionable && selected ? (
								<Button loading={busy} onClick={() => void transact("allow")}>
									{t("允许", "Allow")}
								</Button>
							) : null}
							{canResume ? (
								<Button loading={busy} onClick={() => void transact("resume")}>
									{t("继续任务", "Resume task")}
								</Button>
							) : null}
						</InteractionCardActions>
					) : null}
				</>
			)}
		</InteractionCard>
	);
}
