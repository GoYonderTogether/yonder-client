import { connectorRequestReason } from "@yonder/chat-model";
import { InteractionCard, InteractionCardActions } from "@yonder/chat-presentation";
import { type ConnectorId, ERROR_CODES } from "@yonder/protocol";
import { Button, InlineError, LoadingRow, Spinner } from "@yonder/ui-components";
import { ApiError, useConnectorRequest, useConnectorRequestActions, useConnectorRequestDevices } from "@yonder/ui-data";
import { ICON_SIZE, ICON_STROKE } from "@yonder/ui-tokens";
import { Check, LockKeyhole, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CustomConnectorRequestCard } from "./custom-connector-request-card.tsx";

export function ConnectorRequestCard({ id }: { id: string }) {
	const { t } = useTranslation();
	const request = useConnectorRequest(id);
	const actions = useConnectorRequestActions();
	const [selected, setSelected] = useState<string | null>();
	const [picking, setPicking] = useState(false);
	const deviceChoice = useId();
	const focusPicker = useRef(false);
	const row = request.data;
	const retry = row?.state === "expired" || row?.state === "failed";
	// A custom proposal is confirmed on its device, so this card never fetches a device list for it.
	const confirmable = (row?.state === "pending" || retry) && !row?.proposal;
	const devices = useConnectorRequestDevices(id, confirmable);
	if (request.isPending) return <LoadingRow label={t("app.loading")} />;
	// A Bot-written connector's card is its own shape: it shows the manifest and is confirmed on
	// the target device, never by the in-app allow that this card pushes (03 §2).
	if (row?.proposal) return <CustomConnectorRequestCard row={row} />;
	const connectorIds = row?.connectorIds;
	if (
		!row ||
		!Array.isArray(connectorIds) ||
		connectorIds.length === 0 ||
		connectorIds.some((id) => id !== "local-files" && id !== "computer-control")
	)
		return (
			<InlineError onRetry={() => void request.refetch()} retryLabel={t("app.retry")}>
				{t("connectors.requestFailed")}
			</InlineError>
		);

	const selectable = (devices.data?.items ?? []).filter((device) => device.online && device.supported);
	const preferred = row.deviceHintId ?? (retry ? row.deviceId : null);
	const device =
		selected === undefined
			? (selectable.find((item) => item.id === preferred) ??
				(!preferred && selectable.length === 1 ? selectable[0] : undefined))
			: selectable.find((item) => item.id === selected);
	const showPicker = confirmable && (picking || !device);
	const deviceName = confirmable ? device?.name : row.deviceName;
	const scope = connectorIds.includes("local-files")
		? connectorIds.includes("computer-control")
			? "both"
			: "read"
		: "write";
	const settled = row.state === "granted" || row.state === "cancelled";
	const title = settled
		? t(`connectors.requestState.${row.state}`)
		: deviceName
			? t(`connectors.requestTitle.${scope}`, { device: deviceName })
			: t(confirmable ? "connectors.requestDevicesTitle" : "connectors.requestCardTitle");
	const reason = connectorRequestReason(row.reason);
	const range = t(`connectors.requestScope.${scope}`);
	const detail = deviceName ? (reason ? t("connectors.requestDetail", { reason, scope: range }) : range) : undefined;
	const canResume = row.state === "granted" && row.continuation === "failed" && !row.continuationFailure;
	const busy = actions.confirm.isPending || actions.cancel.isPending;
	const failure = actions.confirm.error ?? actions.cancel.error;
	const storedFailure = row.failure;
	const Glyph = row.state === "granted" ? Check : row.state === "cancelled" ? X : LockKeyhole;

	function allow(deviceId: string, shownConnectors: ConnectorId[]) {
		actions.confirm.mutate(
			{ id, connectorIds: shownConnectors, deviceId },
			{
				onError: (error) => {
					if (!(error instanceof ApiError)) return;
					if (error.code === "device_offline" || error.code === "device_required") {
						setSelected(null);
						void devices.refetch();
					}
					if (error.code === "request_changed") void request.refetch();
				},
			},
		);
	}

	return (
		<InteractionCard
			as="div"
			title={title}
			label={title}
			detail={settled ? undefined : detail}
			glyph={
				row.state === "dispatched" ? (
					<Spinner size="sm" label={t("connectors.requestState.dispatched")} />
				) : (
					<Glyph aria-hidden size={ICON_SIZE.md} strokeWidth={ICON_STROKE.normal} />
				)
			}
		>
			{retry ? (
				<p className="interaction-card-status" role="status">
					{t(`connectors.requestState.${row.state}`)}
				</p>
			) : null}
			{row.state === "failed" && storedFailure ? (
				<InlineError>
					{(ERROR_CODES as readonly string[]).includes(storedFailure) ? t(`errors.${storedFailure}`) : storedFailure}
				</InlineError>
			) : null}
			{showPicker ? (
				devices.isPending ? (
					<LoadingRow label={t("app.loading")} />
				) : devices.isError || !selectable.length ? (
					<InlineError onRetry={() => void devices.refetch()} retryLabel={t("app.retry")}>
						{t(devices.isError ? "connectors.loadFailed" : "connectors.requestDeviceOffline")}
					</InlineError>
				) : (
					<fieldset
						className="interaction-card-choices interaction-card-device-list"
						aria-label={t("connectors.requestDevicesTitle")}
						disabled={busy}
						ref={(list) => {
							if (!list || !focusPicker.current) return;
							focusPicker.current = false;
							list.querySelector<HTMLInputElement>("input:checked")?.focus();
						}}
					>
						{selectable.map((item) => {
							const checked = device?.id === item.id;
							return (
								<label
									key={item.id}
									className={`interaction-card-choice${checked ? " interaction-card-choice-selected" : ""}`}
								>
									<input
										type="radio"
										name={deviceChoice}
										checked={checked}
										className="mt-[var(--spacing-1)] shrink-0 accent-[var(--color-accent)]"
										onChange={() => {
											setPicking(true);
											setSelected(item.id);
										}}
									/>
									<span className="interaction-card-device-name">{item.name}</span>
								</label>
							);
						})}
					</fieldset>
				)
			) : null}
			{row.state === "pending" || row.state === "dispatched" || (confirmable && device) || canResume ? (
				<InteractionCardActions as="div">
					{confirmable && device && !showPicker && selectable.length > 1 ? (
						<Button
							variant="ghost"
							onClick={() => {
								focusPicker.current = true;
								setPicking(true);
							}}
							disabled={busy}
						>
							{t("connectors.requestSwitchDevice")}
						</Button>
					) : null}
					{row.state === "pending" || row.state === "dispatched" ? (
						<Button
							loading={actions.cancel.isPending}
							disabled={actions.confirm.isPending}
							onClick={() => actions.cancel.mutate(id)}
						>
							{t(row.state === "pending" ? "connectors.requestDeny" : "app.cancel")}
						</Button>
					) : null}
					{confirmable && device ? (
						<Button
							variant="primary"
							loading={actions.confirm.isPending}
							disabled={actions.cancel.isPending}
							onClick={() => allow(device.id, connectorIds)}
						>
							{t(retry ? "connectors.requestRetry" : "connectors.requestAllow")}
						</Button>
					) : null}
					{canResume ? (
						<Button loading={actions.resume.isPending} onClick={() => actions.resume.mutate(id)}>
							{t("connectors.requestContinue")}
						</Button>
					) : null}
				</InteractionCardActions>
			) : null}
			{canResume && actions.resume.error ? <InlineError>{t("connectors.requestContinueFailed")}</InlineError> : null}
			{failure && !settled ? (
				<InlineError>
					{failure instanceof ApiError ? t(`errors.${failure.code}`) : t("connectors.requestFailed")}
				</InlineError>
			) : null}
		</InteractionCard>
	);
}
