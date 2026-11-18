import { BrandedQrCode, Button } from "@yonder/ui-components";
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
import { FeishuExternalConversations } from "./feishu-external.tsx";

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

export function FeishuChannel({ botId }: { botId: string }) {
	const { t } = useTranslation();
	return (
		<div className="grid gap-[var(--spacing-4)]">
			<ChannelControls botId={botId} provider="feishu" />
			<ChannelControls botId={botId} provider="wechat" />
			<p>{t("channels.qqPrerequisite")}</p>
		</div>
	);
}

function ChannelControls({ botId, provider }: { botId: string; provider: "feishu" | "wechat" }) {
	const { t } = useTranslation();
	const channels = useChannels();
	const actions = useChannelActions();
	const wechat = provider === "wechat";
	const start = wechat ? actions.startWechat : actions.start;
	const connection = channels.data?.items.find(
		(item) => item.botId === botId && (item.provider ?? "feishu") === provider,
	);
	const attemptId = start.data?.id;
	const failed =
		channels.isError ||
		start.isError ||
		actions.toggle.isError ||
		actions.disconnect.isError ||
		actions.admission.isError;
	return (
		<section className="flex flex-col gap-[var(--spacing-2)]">
			{connection ? (
				<>
					<p>
						{connection.name ?? t(wechat ? "channels.wechat" : "channels.feishu")} ·{" "}
						{t(
							`channels.${!connection.enabled ? "paused" : connection.credentialState === "invalid" ? "failed" : connection.status}`,
						)}
					</p>
					{connection.missingPermissions.length > 0 && (
						<p>{t("channels.missing", { count: connection.missingPermissions.length })}</p>
					)}
					{!wechat && (
						<>
							<label>
								<input
									type="checkbox"
									checked={connection.allowExternalDm}
									disabled={actions.admission.isPending}
									onChange={(event) =>
										actions.admission.mutate({
											id: connection.id,
											allowExternalDm: event.target.checked,
											allowGroups: connection.allowGroups,
										})
									}
								/>
								{t("channels.allowExternalDm")}
							</label>
							<label>
								<input
									type="checkbox"
									checked={connection.allowGroups}
									disabled={actions.admission.isPending}
									onChange={(event) =>
										actions.admission.mutate({
											id: connection.id,
											allowExternalDm: connection.allowExternalDm,
											allowGroups: event.target.checked,
										})
									}
								/>
								{t("channels.allowGroups")}
							</label>
						</>
					)}
					<Button
						size="sm"
						loading={actions.toggle.isPending}
						onClick={() => actions.toggle.mutate({ id: connection.id, enabled: !connection.enabled })}
					>
						{t(connection.enabled ? "channels.pause" : "channels.resume")}
					</Button>
					{!wechat && <FeishuExternalConversations key={connection.id} connectionId={connection.id} />}
					<Button
						size="sm"
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
				<Button size="sm" loading={start.isPending} onClick={() => start.mutate(botId)}>
					{t(wechat ? "channels.connectWechat" : "channels.connect")}
				</Button>
			) : channels.isSuccess ? (
				<p>{t(wechat ? "channels.wechatPrerequisite" : "channels.unavailable")}</p>
			) : null}
			{failed && <p role="alert">{t("channels.failed")}</p>}
			{attemptId && <FeishuAttemptCard key={attemptId} id={attemptId} />}
		</section>
	);
}

export function ChannelsSection() {
	const { t } = useTranslation();
	const primary = useBot();
	const person = usePerson();
	const contacts = useContacts();
	const [choice, select] = useState<string>();
	const bots = ownedBots(contacts.data?.items, person?.id);
	if (primary && !bots.some((bot) => bot.id === primary.id)) bots.unshift(primary);
	const selected = bots.find((bot) => bot.id === choice) ?? bots.find((bot) => bot.id === primary?.id) ?? bots[0];
	return (
		<section className="flex flex-col gap-[var(--spacing-3)]">
			{selected && (
				<>
					<label>
						{t("bots.title")}
						<select value={selected.id} onChange={(event) => select(event.target.value)}>
							{bots.map((bot) => (
								<option key={bot.id} value={bot.id}>
									{bot.displayName}
								</option>
							))}
						</select>
					</label>
					<FeishuChannel key={selected.id} botId={selected.id} />
				</>
			)}
		</section>
	);
}
