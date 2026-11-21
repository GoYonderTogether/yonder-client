import type { ChannelConnection } from "@yonder/protocol";
import { BotSelector, Button, IconTile, ListGroup, ListRow } from "@yonder/ui-components";
import { ownedBots, useBot, useChannels, useContacts, usePerson } from "@yonder/ui-data";
import { MessageCircle, MessagesSquare, Send } from "lucide-react";
import { useTranslation } from "react-i18next";

const CHANNELS = ["feishu", "wechat", "qq"] as const;
const ICONS = { feishu: Send, wechat: MessagesSquare, qq: MessageCircle };

export type MessageChannel = (typeof CHANNELS)[number];

export function isMessageChannel(value: string | undefined): value is MessageChannel {
	return CHANNELS.some((channel) => channel === value);
}

export function findBotChannel(
	items: readonly ChannelConnection[] | undefined,
	botId: string,
	provider: MessageChannel,
) {
	return items?.find((item) => item.botId === botId && (item.provider ?? "feishu") === provider);
}

export function channelStatus(connection: ChannelConnection) {
	if (!connection.enabled) return "paused";
	if (connection.credentialState === "invalid" || connection.status === "failed") return "connectionFailed";
	return connection.status;
}

export function ChannelLoadFailure({ onRetry }: { onRetry: () => void }) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-wrap items-center gap-[var(--spacing-3)]">
			<p role="alert" className="text-caption text-[var(--color-danger)]">
				{t("channels.loadFailed")}
			</p>
			<Button variant="link" size="sm" onClick={onRetry}>
				{t("app.retry")}
			</Button>
		</div>
	);
}

export function ChannelDirectory({
	botId,
	onOpenChannel,
}: {
	botId: string;
	onOpenChannel: (channel: MessageChannel) => void;
}) {
	const { t } = useTranslation();
	const channels = useChannels();
	if (!channels.data) {
		return channels.isError ? (
			<ChannelLoadFailure onRetry={() => void channels.refetch()} />
		) : (
			<p role="status">{t("app.loading")}</p>
		);
	}
	const { items, available, wechatAvailable } = channels.data;
	const rows = CHANNELS.map((channel) => ({ channel, connection: findBotChannel(items, botId, channel) }));
	const connected = rows.filter(({ connection }) => connection);
	const disconnected = rows.filter(({ connection }) => !connection);

	function row({ channel, connection }: (typeof rows)[number]) {
		const title = t(`channels.${channel}`);
		const Icon = ICONS[channel];
		const status = connection ? channelStatus(connection) : null;
		const canConnect = channel === "feishu" ? available : channel === "wechat" && wechatAvailable;
		const action = canConnect ? "openConnection" : "unavailableShort";
		return (
			<ListRow
				key={channel}
				leading={
					<IconTile>
						<Icon size={18} />
					</IconTile>
				}
				title={title}
				subtitle={connection?.name !== title ? connection?.name : undefined}
				trailing={status === "connected" ? undefined : t(`channels.${status ?? action}`)}
				chevron
				onClick={() => onOpenChannel(channel)}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			{connected.length ? <ListGroup title={t("channels.connected")}>{connected.map(row)}</ListGroup> : null}
			{disconnected.length ? <ListGroup title={t("channels.disconnected")}>{disconnected.map(row)}</ListGroup> : null}
		</div>
	);
}

export function ChannelsSection({
	selectedBotId,
	onSelectBot,
	onOpenChannel,
}: {
	selectedBotId: string | undefined;
	onSelectBot: (botId: string) => void;
	onOpenChannel: (botId: string, channel: MessageChannel) => void;
}) {
	const { t } = useTranslation();
	const primary = useBot();
	const person = usePerson();
	const contacts = useContacts();
	const bots = ownedBots(contacts.data?.items, person?.id);
	if (primary && !bots.some((bot) => bot.id === primary.id)) bots.unshift(primary);
	const match = bots.find((bot) => bot.id === selectedBotId);
	if (contacts.isLoading && !match && (!primary || selectedBotId)) return <p role="status">{t("app.loading")}</p>;
	if (contacts.isError && (selectedBotId ? !match : !bots.length)) {
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
			<BotSelector label={t("channels.selectBot")} bots={bots} selectedBotId={selected.id} onSelectBot={onSelectBot} />
			<ChannelDirectory botId={selected.id} onOpenChannel={(channel) => onOpenChannel(selected.id, channel)} />
		</div>
	);
}
