import { ChannelDirectory, ChannelSettings, FeishuExternalConversations } from "@yonder/feature-me";
import { BotForm, BotModelPage, BotSettingsOverview } from "@yonder/feature-members";
import type { Member } from "@yonder/protocol";
import { ListGroup, ListRow } from "@yonder/ui-components";
import { ApiError, useBot, useContacts, useResetBotConversation } from "@yonder/ui-data";
import { ConfirmDialog } from "@yonder/ui-shell";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppNotice } from "./app-notice.tsx";
import { SocialPersona } from "./social-settings.tsx";

export const CHAT_BOT_PAGE_TITLE = {
	profile: "bots.basicProfile",
	persona: "members.social.personaTitle",
	model: "models.botModelTitle",
	channels: "channels.title",
	feishu: "channels.feishu",
	wechat: "channels.wechat",
	qq: "channels.qq",
	external: "channels.externalConversations",
} as const;

export type ChatBotPage = keyof typeof CHAT_BOT_PAGE_TITLE;

export function ChatBotSettings({
	bot,
	conversationId,
	onDeleted,
	onOpenPage,
	preferences,
}: {
	bot: Member;
	conversationId?: string | undefined;
	onDeleted: (chatId: string | undefined) => void;
	onOpenPage: (page: ChatBotPage) => void;
	preferences?: ReactNode;
}) {
	return (
		<ChatSettingsBody>
			<BotSettingsOverview
				bot={bot}
				onEdit={() => onOpenPage("profile")}
				onPersona={() => onOpenPage("persona")}
				onModel={() => onOpenPage("model")}
				onChannels={() => onOpenPage("channels")}
				onDeleted={onDeleted}
			>
				{preferences}
				{conversationId ? <BotConversationActions key={conversationId} conversationId={conversationId} /> : null}
			</BotSettingsOverview>
		</ChatSettingsBody>
	);
}

function BotConversationActions({ conversationId }: { conversationId: string }) {
	const { t } = useTranslation();
	const notify = useAppNotice();
	const reset = useResetBotConversation(conversationId);
	const [confirming, setConfirming] = useState(false);
	const failure =
		reset.error instanceof ApiError && reset.error.code === "conversation_busy"
			? t("bots.resetBusy")
			: t(reset.variables ? "bots.clearHistoryFailed" : "bots.restartFailed");

	function run(clearHistory: boolean) {
		reset.mutate(clearHistory, {
			onSuccess: () => {
				setConfirming(false);
				notify({
					key: `bot-conversation:${conversationId}:${clearHistory}`,
					text: t(clearHistory ? "bots.historyCleared" : "bots.restarted"),
				});
			},
			onError: (error) => {
				if (clearHistory) return;
				notify({
					key: `bot-conversation:${conversationId}:restart-error`,
					text: t(
						error instanceof ApiError && error.code === "conversation_busy" ? "bots.resetBusy" : "bots.restartFailed",
					),
					tone: "error",
				});
			},
		});
	}

	return (
		<>
			<ListGroup>
				<ListRow
					title={t("bots.restart")}
					disabled={reset.isPending}
					aria-busy={reset.isPending && !reset.variables}
					onClick={() => run(false)}
				/>
				<ListRow
					title={t("bots.clearHistory")}
					tone="danger"
					disabled={reset.isPending}
					aria-haspopup="dialog"
					onClick={() => {
						reset.reset();
						setConfirming(true);
					}}
				/>
			</ListGroup>
			{confirming ? (
				<ConfirmDialog
					open
					title={t("bots.clearHistoryTitle")}
					body={t("bots.clearHistoryBody")}
					confirmLabel={t("bots.clearHistory")}
					cancelLabel={t("app.cancel")}
					closeLabel={t("app.close")}
					busy={reset.isPending}
					error={reset.isError ? failure : null}
					onCancel={() => {
						if (!reset.isPending) setConfirming(false);
					}}
					onConfirm={() => run(true)}
				/>
			) : null}
		</>
	);
}

export function ChatBotSettingsChild({
	bot,
	page,
	back,
	onDirtyChange,
	onOpenPage,
}: {
	bot: Member;
	page: ChatBotPage;
	back: () => void;
	onDirtyChange?: ((dirty: boolean) => void) | undefined;
	onOpenPage: (page: ChatBotPage) => void;
}) {
	const { t } = useTranslation();
	return <ChatSettingsBody>{body()}</ChatSettingsBody>;

	function body() {
		switch (page) {
			case "profile":
				return <ChatBotProfile botId={bot.id} back={back} onDirtyChange={onDirtyChange} />;
			case "persona":
				return (
					<>
						<p className="text-body text-[var(--color-text-secondary)]">
							{t("members.social.personaScope", { name: bot.displayName })}
						</p>
						<SocialPersona botId={bot.id} onSaved={back} onDirtyChange={onDirtyChange} />
					</>
				);
			case "model":
				return (
					<>
						<p className="text-body text-[var(--color-text-secondary)]">
							{t("models.botModelHint", { name: bot.displayName })}
						</p>
						<BotModelPage bot={bot} />
					</>
				);
			case "channels":
				return <ChannelDirectory botId={bot.id} onOpenChannel={onOpenPage} />;
			case "feishu":
				return <ChannelSettings botId={bot.id} provider={page} onOpenExternal={() => onOpenPage("external")} />;
			case "wechat":
			case "qq":
				return <ChannelSettings botId={bot.id} provider={page} />;
			case "external":
				return <FeishuExternalConversations botId={bot.id} />;
		}
	}
}

function ChatBotProfile({
	botId,
	back,
	onDirtyChange,
}: {
	botId: string;
	back: () => void;
	onDirtyChange: ((dirty: boolean) => void) | undefined;
}) {
	const primary = useBot();
	const contacts = useContacts();
	const bot = primary?.id === botId ? primary : contacts.data?.items.find((member) => member.id === botId);
	return bot?.kind === "bot" ? (
		<BotForm mode="edit" settings bot={bot} onSaved={back} onDirtyChange={onDirtyChange} />
	) : null;
}

function ChatSettingsBody({ children }: { children: ReactNode }) {
	return <div className="flex flex-col gap-[var(--spacing-4)] p-[var(--spacing-4)]">{children}</div>;
}
