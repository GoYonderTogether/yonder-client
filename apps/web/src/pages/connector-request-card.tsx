import { ERROR_CODES } from "@yonder/protocol";
import { Button, InlineError, LoadingRow } from "@yonder/ui-components";
import { ApiError, useConnectorRequest, useConnectorRequestActions, useConnectorRequestDevices } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** The capability line under the connector names; the same copy the connectors page uses. */
const SCOPE_KEYS = {
	"local-files": "connectors.readScope",
	"computer-control": "connectors.fileToolsScope",
} as const;

const NAME_KEYS = {
	"local-files": "connectors.localFiles.name",
	"computer-control": "connectors.computerControl.name",
} as const;

/** The real failure: a known error code is shown in the reader's language, anything else verbatim. */
function failureText(failure: string, t: (key: string) => string): string {
	return (ERROR_CODES as readonly string[]).includes(failure) ? t(`errors.${failure}`) : failure;
}

/**
 * One authorization card. Allowing it is the consent: the server picks the target device, that
 * device's client stores the grant, and every endpoint's copy of this card follows
 * `connector_request.updated`. Nothing here navigates away or waits for the Bot to finish.
 */
export function ConnectorRequestCard({ id }: { id: string }) {
	const { t } = useTranslation();
	const request = useConnectorRequest(id);
	const actions = useConnectorRequestActions();
	const [choosing, setChoosing] = useState(false);
	const [offline, setOffline] = useState(false);
	const devices = useConnectorRequestDevices(id, choosing);
	if (request.isPending) return <p role="status">{t("app.loading")}</p>;
	if (!request.data)
		return (
			<InlineError onRetry={() => void request.refetch()} retryLabel={t("app.retry")}>
				{t("connectors.requestFailed")}
			</InlineError>
		);
	const row = request.data;
	const scopeKeys = [...new Set(row.connectorIds.map((connectorId) => SCOPE_KEYS[connectorId]))];
	const selectable = (devices.data?.items ?? []).filter((device) => device.online && device.supported);
	function allow(deviceId?: string) {
		setOffline(false);
		actions.confirm.mutate(
			{ id, ...(deviceId ? { deviceId } : {}) },
			{
				onSuccess: () => setChoosing(false),
				onError: (error) => {
					if (!(error instanceof ApiError)) return;
					if (error.code === "device_required") setChoosing(true);
					if (error.code === "device_offline") {
						setOffline(true);
						setChoosing(false);
					}
				},
			},
		);
	}
	const retry = row.state === "expired" || row.state === "failed";
	const failure = actions.confirm.error ?? actions.cancel.error;
	// The device answer named none, or the server said the target is not online: same sentence, and
	// the card stays pending so the user can try again once the client is open.
	const noDevice = offline || (choosing && !devices.isPending && (devices.isError || selectable.length === 0));
	return (
		<section className="flex min-w-0 flex-col gap-[var(--spacing-2)] rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)] p-[var(--spacing-4)]">
			<strong>{t("connectors.requestCardTitle")}</strong>
			<p className="break-words text-body font-medium">
				{row.connectorIds.map((connectorId) => t(NAME_KEYS[connectorId])).join(" · ")}
			</p>
			{row.reason ? <p className="whitespace-pre-wrap break-words text-body">{row.reason}</p> : null}
			{row.deviceName ? (
				<p className="break-words text-caption text-[var(--color-text-tertiary)]">
					{t("connectors.requestDevice", { device: row.deviceName })}
				</p>
			) : null}
			{scopeKeys.map((scopeKey) => (
				<p key={scopeKey} className="text-caption text-[var(--color-text-secondary)]">
					{t(scopeKey)}
				</p>
			))}
			<p className="text-caption text-[var(--color-text-secondary)]">{t(`connectors.requestState.${row.state}`)}</p>
			{row.state === "failed" && row.failure ? <InlineError>{failureText(row.failure, t)}</InlineError> : null}
			{choosing ? (
				<div className="flex min-w-0 flex-col gap-[var(--spacing-2)]">
					<p className="text-caption text-[var(--color-text-secondary)]">{t("connectors.requestDevicesTitle")}</p>
					<div className="flex flex-wrap gap-[var(--spacing-2)]">
						{selectable.map((device) => (
							<Button key={device.id} size="sm" variant="secondary" onClick={() => allow(device.id)}>
								{device.name}
							</Button>
						))}
					</div>
					{devices.isPending && selectable.length === 0 ? <LoadingRow label={t("app.loading")} /> : null}
				</div>
			) : null}
			{noDevice ? (
				<p className="text-caption text-[var(--color-text-secondary)]">{t("connectors.requestDeviceOffline")}</p>
			) : null}
			<div className="flex flex-wrap gap-[var(--spacing-2)]">
				{(row.state === "pending" || retry) && !choosing ? (
					<Button
						variant="primary"
						size="sm"
						loading={actions.confirm.isPending}
						onClick={() => allow(retry ? (row.deviceId ?? undefined) : undefined)}
					>
						{t(retry ? "connectors.requestRetry" : "connectors.requestAllow")}
					</Button>
				) : null}
				{row.state === "pending" || row.state === "dispatched" ? (
					<Button size="sm" loading={actions.cancel.isPending} onClick={() => actions.cancel.mutate(id)}>
						{t("app.cancel")}
					</Button>
				) : null}
			</div>
			{failure && !noDevice && !choosing ? (
				<InlineError>
					{failure instanceof ApiError ? t(`errors.${failure.code}`) : t("connectors.requestFailed")}
				</InlineError>
			) : null}
		</section>
	);
}
