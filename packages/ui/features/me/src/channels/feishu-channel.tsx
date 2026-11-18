import { BrandedQrCode, Button, Checkbox, ListGroup, ListRow, SelectField } from "@yonder/ui-components";
import {
	ownedBots,
	useBot,
	useChannelActions,
	useChannelAttempt,
	useChannels,
	useContacts,
	usePerson,
} from "@yonder/ui-data";
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
		<div className="grid gap-[var(--spacing-4)]">
			<ChannelControls botId={botId} provider="feishu" channels={channels} onOpenExternal={onOpenExternal} />
			<ChannelControls botId={botId} provider="wechat" channels={channels} />
			<p className="text-caption text-[var(--color-text-secondary)]">{t("channels.qqPrerequisite")}</p>
		</div>
	);
}

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
	const failed =
		channels.isError ||
		start.isError ||
		actions.toggle.isError ||
		actions.disconnect.isError ||
		actions.admission.isError;
	return (
		<section className="flex min-w-0 flex-col gap-[var(--spacing-3)] rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] p-[var(--spacing-4)]">
			<div className="flex flex-wrap items-start justify-between gap-[var(--spacing-2)]">
				<div className="min-w-0">
					<h3 className="text-h3 font-medium">{title}</h3>
					{connection?.name && connection.name !== title ? (
						<p className="text-caption text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
							{connection.name}
						</p>
					) : null}
				</div>
				{channels.isLoading ? (
					<p role="status" className="text-caption">
						{t("app.loading")}
					</p>
				) : null}
				{channels.data ? (
					<p
						className={
							state === "connected"
								? "text-caption text-[var(--color-success)]"
								: "text-caption text-[var(--color-text-secondary)]"
						}
					>
						{t(`channels.${state}`)}
					</p>
				) : null}
			</div>
			{connection ? (
				<>
					{connection.missingPermissions.length > 0 && (
						<p className="text-caption text-[var(--color-danger)]">
							{t("channels.missing", { count: connection.missingPermissions.length })}
						</p>
					)}
					{!wechat && (
						<>
							<Checkbox
								checked={connection.allowExternalDm}
								disabled={actions.admission.isPending}
								onChange={(event) =>
									actions.admission.mutate({
										id: connection.id,
										allowExternalDm: event.target.checked,
										allowGroups: connection.allowGroups,
									})
								}
							>
								{t("channels.allowExternalDm")}
							</Checkbox>
							<Checkbox
								checked={connection.allowGroups}
								disabled={actions.admission.isPending}
								onChange={(event) =>
									actions.admission.mutate({
										id: connection.id,
										allowExternalDm: connection.allowExternalDm,
										allowGroups: event.target.checked,
									})
								}
							>
								{t("channels.allowGroups")}
							</Checkbox>
						</>
					)}
					<Button
						size="sm"
						className="self-start"
						loading={actions.toggle.isPending}
						onClick={() => actions.toggle.mutate({ id: connection.id, enabled: !connection.enabled })}
					>
						{t(connection.enabled ? "channels.pause" : "channels.resume")}
					</Button>
					{onOpenExternal ? (
						<ListGroup>
							<ListRow title={t("channels.externalConversations")} chevron onClick={onOpenExternal} />
						</ListGroup>
					) : null}
					<Button
						size="sm"
						className="self-start"
						loading={actions.disconnect.isPending}
						onClick={() => {
							if (window.confirm(t(wechat ? "channels.confirmDisconnectWechat" : "channels.confirmDisconnect"))) {
								start.reset();
								actions.disconnect.mutate(connection.id);
							}
						}}
					>
						{t("channels.disconnect")}
					</Button>
				</>
			) : (wechat ? channels.data?.wechatAvailable : channels.data?.available) ? (
				<Button size="sm" className="self-start" loading={start.isPending} onClick={() => start.mutate(botId)}>
					{t(wechat ? "channels.connectWechat" : "channels.connect")}
				</Button>
			) : channels.isSuccess ? (
				<p className="text-caption text-[var(--color-text-secondary)]">
					{t(wechat ? "channels.wechatPrerequisite" : "channels.unavailable")}
				</p>
			) : null}
			{failed && <p role="alert">{t("channels.failed")}</p>}
			{attemptId && <FeishuAttemptCard key={attemptId} id={attemptId} />}
		</section>
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
		<div className="flex flex-col gap-[var(--spacing-6)]">
			<SelectField
				label={t("channels.selectBot")}
				value={selected.id}
				options={bots.map((bot) => ({ value: bot.id, label: bot.displayName }))}
				onChange={onSelectBot ?? select}
			/>
			<section className="flex flex-col gap-[var(--spacing-3)]">
				<h2 className="text-h3 font-semibold">{t("channels.connections")}</h2>
				<FeishuChannel key={selected.id} botId={selected.id} onOpenExternal={() => onOpenExternal(selected.id)} />
			</section>
		</div>
	);
}
