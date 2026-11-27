import { BrandedQrCode, Button, ListGroup, ListRow, ListSwitch, ListValue } from "@yonder/ui-components";
import { useChannelActions, useChannelAttempt, useChannels } from "@yonder/ui-data";
import { ConfirmDialog } from "@yonder/ui-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChannelLoadFailure, channelStatus, findBotChannel, type MessageChannel } from "./channel-directory.tsx";

export function FeishuAttemptCard({ id, onRetry }: { id: string; onRetry?: () => void }) {
	const { t } = useTranslation();
	const result = useChannelAttempt(id);
	const { cancel } = useChannelActions();
	const attempt = cancel.data ?? result?.attempt;
	const live = attempt?.state === "awaiting" || attempt?.state === "connecting";
	const wechat = attempt?.provider === "wechat";
	const link =
		attempt?.state === "awaiting" && attempt.link && Date.parse(attempt.link.expiresAt) > Date.now()
			? attempt.link.url
			: null;
	return (
		<section className="flex flex-col gap-[var(--spacing-2)] rounded-[var(--radius-md)] border border-[var(--color-border)] p-[var(--spacing-3)]">
			{onRetry ? null : <strong>{t(wechat ? "channels.wechat" : "channels.feishu")}</strong>}
			<p role="status">
				{t(
					attempt?.verificationRequired
						? "channels.wechatVerification"
						: wechat && attempt?.state === "completed"
							? "channels.wechatCompleted"
							: `channels.${result?.error ? "failed" : (attempt?.state ?? "loading")}`,
				)}
			</p>
			{link && wechat && <BrandedQrCode value={link} label={t("channels.wechatScan")} />}
			{link && !wechat && (
				<a href={link} target="_blank" rel="noopener noreferrer">
					{t("channels.authorize")}
				</a>
			)}
			{live && (
				<Button size="sm" loading={cancel.isPending} onClick={() => cancel.mutate(id)}>
					{t("app.cancel")}
				</Button>
			)}
			{onRetry && attempt && !live && attempt.state !== "completed" ? (
				<Button size="sm" onClick={onRetry}>
					{t("app.retry")}
				</Button>
			) : null}
			{cancel.isError && <p role="alert">{t("channels.failed")}</p>}
		</section>
	);
}

export function ChannelSettings({
	botId,
	provider,
	onOpenExternal,
}: {
	botId: string;
	provider: MessageChannel;
	onOpenExternal?: () => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			{provider === "qq" ? (
				<ListGroup footer={t("channels.qqPrerequisite")}>
					<ListValue title={t("channels.status")} value={t("channels.unavailableShort")} />
				</ListGroup>
			) : (
				<ChannelControls botId={botId} provider={provider} onOpenExternal={onOpenExternal} />
			)}
		</div>
	);
}

/**
 * One channel as one settings section (docs/settings-forms.md): its status, the switches that
 * decide who may reach the Bot through it, the page of its conversations, then disconnect, which
 * asks first. Before it is connected the section holds one action row.
 */
function ChannelControls({
	botId,
	provider,
	onOpenExternal,
}: {
	botId: string;
	provider: "feishu" | "wechat";
	onOpenExternal: (() => void) | undefined;
}) {
	const { t } = useTranslation();
	const channels = useChannels();
	const actions = useChannelActions();
	const [confirming, setConfirming] = useState(false);
	const wechat = provider === "wechat";
	const title = t(`channels.${provider}`);
	const start = wechat ? actions.startWechat : actions.start;
	if (!channels.data) {
		return channels.isError ? (
			<ChannelLoadFailure onRetry={() => void channels.refetch()} />
		) : (
			<p role="status">{t("app.loading")}</p>
		);
	}
	const connection = findBotChannel(channels.data.items, botId, provider);
	const attemptId = start.data?.id;
	const available = wechat ? channels.data.wechatAvailable : channels.data.available;
	const failed = channels.isError || start.isError || actions.toggle.isError || actions.admission.isError;
	const footer = connection?.missingPermissions.length
		? t("channels.missing", { count: connection.missingPermissions.length })
		: !connection && !available
			? t(wechat ? "channels.wechatPrerequisite" : "channels.unavailable")
			: undefined;
	const state = connection ? channelStatus(connection) : "disconnected";
	const begin = () => start.mutate(botId);
	return (
		<>
			{connection || !attemptId ? (
				<ListGroup footer={footer}>
					<ListValue
						title={t("channels.status")}
						value={t(`channels.${state}`)}
						tone={state === "connected" ? "success" : state === "connectionFailed" ? "danger" : "default"}
					/>
					{connection?.name && connection.name !== title ? (
						<ListValue title={t("channels.account")} value={connection.name} />
					) : null}
					{connection ? (
						<>
							<ListSwitch
								title={t("channels.active")}
								checked={connection.enabled}
								busy={actions.toggle.isPending}
								onChange={(enabled) => actions.toggle.mutate({ id: connection.id, enabled })}
							/>
							{wechat ? null : (
								<>
									<ListSwitch
										title={t("channels.allowExternalDm")}
										checked={connection.allowExternalDm}
										busy={actions.admission.isPending}
										onChange={(allowExternalDm) =>
											actions.admission.mutate({
												id: connection.id,
												allowExternalDm,
												allowGroups: connection.allowGroups,
											})
										}
									/>
									<ListSwitch
										title={t("channels.allowGroups")}
										checked={connection.allowGroups}
										busy={actions.admission.isPending}
										onChange={(allowGroups) =>
											actions.admission.mutate({
												id: connection.id,
												allowExternalDm: connection.allowExternalDm,
												allowGroups,
											})
										}
									/>
								</>
							)}
							{onOpenExternal ? (
								<ListRow title={t("channels.externalConversations")} chevron onClick={onOpenExternal} />
							) : null}
							<ListRow
								title={t("channels.disconnect")}
								tone="danger"
								disabled={actions.disconnect.isPending}
								onClick={() => setConfirming(true)}
							/>
						</>
					) : available ? (
						<ListRow
							title={t(wechat ? "channels.connectWechat" : "channels.connect")}
							tone="accent"
							disabled={start.isPending}
							onClick={begin}
						/>
					) : null}
				</ListGroup>
			) : null}
			{failed ? (
				<p role="alert" className="px-[var(--spacing-1)] text-caption text-[var(--color-danger)]">
					{t("channels.failed")}
				</p>
			) : null}
			{attemptId ? <FeishuAttemptCard key={attemptId} id={attemptId} onRetry={begin} /> : null}
			{connection ? (
				<ConfirmDialog
					open={confirming}
					title={t(wechat ? "channels.confirmDisconnectWechat" : "channels.confirmDisconnect")}
					body={t("channels.disconnectBody")}
					confirmLabel={t("channels.disconnect")}
					cancelLabel={t("app.cancel")}
					closeLabel={t("app.close")}
					busy={actions.disconnect.isPending}
					error={actions.disconnect.isError ? t("channels.failed") : null}
					onCancel={() => setConfirming(false)}
					onConfirm={() => {
						start.reset();
						actions.disconnect.mutate(connection.id, { onSuccess: () => setConfirming(false) });
					}}
				/>
			) : null}
		</>
	);
}
