import { BotSelector, BrandedQrCode, Button, ListGroup, ListRow, ListSwitch, ListValue } from "@yonder/ui-components";
import {
	ownedBots,
	useBot,
	useChannelActions,
	useChannelAttempt,
	useChannels,
	useContacts,
	usePerson,
} from "@yonder/ui-data";
import { ConfirmDialog } from "@yonder/ui-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function FeishuAttemptCard({ id }: { id: string }) {
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
			<strong>{t(wechat ? "channels.wechat" : "channels.feishu")}</strong>
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
			{cancel.isError && <p role="alert">{t("channels.failed")}</p>}
		</section>
	);
}

export function FeishuChannel({ botId, onOpenExternal }: { botId: string; onOpenExternal: () => void }) {
	const { t } = useTranslation();
	const channels = useChannels();
	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			<ChannelControls botId={botId} provider="feishu" channels={channels} onOpenExternal={onOpenExternal} />
			<ChannelControls botId={botId} provider="wechat" channels={channels} />
			<ListGroup title={t("channels.qq")} footer={t("channels.qqPrerequisite")}>
				<ListValue title={t("channels.status")} value={t("channels.disconnected")} />
			</ListGroup>
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
	channels,
	onOpenExternal,
}: {
	botId: string;
	provider: "feishu" | "wechat";
	channels: ReturnType<typeof useChannels>;
	onOpenExternal?: () => void;
}) {
	const { t } = useTranslation();
	const actions = useChannelActions();
	const [confirming, setConfirming] = useState(false);
	const wechat = provider === "wechat";
	const title = t(wechat ? "channels.wechat" : "channels.feishu");
	const start = wechat ? actions.startWechat : actions.start;
	const connection = channels.data?.items.find(
		(item) => item.botId === botId && (item.provider ?? "feishu") === provider,
	);
	const state = connection
		? !connection.enabled
			? "paused"
			: connection.credentialState === "invalid"
				? "connectionFailed"
				: connection.status
		: "disconnected";
	const attemptId = start.data?.id;
	const failed = channels.isError || start.isError || actions.toggle.isError || actions.admission.isError;
	const available = wechat ? channels.data?.wechatAvailable : channels.data?.available;
	const footer = connection?.missingPermissions.length
		? t("channels.missing", { count: connection.missingPermissions.length })
		: !connection && channels.isSuccess && !available
			? t(wechat ? "channels.wechatPrerequisite" : "channels.unavailable")
			: undefined;
	return (
		<>
			<ListGroup title={title} footer={footer}>
				<ListValue
					title={t("channels.status")}
					value={channels.isLoading ? t("app.loading") : t(`channels.${state}`)}
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
						onClick={() => start.mutate(botId)}
					/>
				) : null}
			</ListGroup>
			{failed ? (
				<p role="alert" className="px-[var(--spacing-1)] text-caption text-[var(--color-danger)]">
					{t("channels.failed")}
				</p>
			) : null}
			{attemptId ? <FeishuAttemptCard key={attemptId} id={attemptId} /> : null}
			{connection ? (
				<ConfirmDialog
					open={confirming}
					title={t(wechat ? "channels.confirmDisconnectWechat" : "channels.confirmDisconnect")}
					body={t("channels.disconnectBody")}
					confirmLabel={t("channels.disconnect")}
					cancelLabel={t("app.cancel")}
					closeLabel={t("app.close")}
					backLabel={t("app.back")}
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

export function ChannelsSection({
	selectedBotId,
	onSelectBot,
	onOpenExternal,
}: {
	selectedBotId?: string | undefined;
	onSelectBot?: (botId: string) => void;
	onOpenExternal: (botId: string) => void;
}) {
	const { t } = useTranslation();
	const primary = useBot();
	const person = usePerson();
	const contacts = useContacts();
	const [choice, select] = useState<string>();
	const bots = ownedBots(contacts.data?.items, person?.id);
	if (primary && !bots.some((bot) => bot.id === primary.id)) bots.unshift(primary);
	const requested = selectedBotId ?? choice;
	const match = bots.find((bot) => bot.id === requested);
	if (contacts.isLoading && !match && (!primary || requested)) return <p role="status">{t("app.loading")}</p>;
	if (contacts.isError && (requested ? !match : !bots.length)) {
		return (
			<div className="flex flex-wrap items-center gap-[var(--spacing-3)]">
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{t("bots.loadFailed")}
				</p>
				<Button variant="link" size="sm" onClick={() => void contacts.refetch()}>
					{t("app.retry")}
				</Button>
			</div>
		);
	}
	const selected = match ?? bots.find((bot) => bot.id === primary?.id) ?? bots[0];
	if (!selected) return <p className="text-caption text-[var(--color-text-secondary)]">{t("bots.empty")}</p>;
	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			<BotSelector
				label={t("channels.selectBot")}
				bots={bots}
				selectedBotId={selected.id}
				onSelectBot={onSelectBot ?? select}
			/>
			<FeishuChannel key={selected.id} botId={selected.id} onOpenExternal={() => onOpenExternal(selected.id)} />
		</div>
	);
}
