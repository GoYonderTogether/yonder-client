import { FeishuChannel, FeishuExternalConversations } from "@yonder/feature-me";
import { BotForm, BotSettingsOverview } from "@yonder/feature-members";
import type { Member } from "@yonder/protocol";
import { useBot, useContacts } from "@yonder/ui-data";
import { useSidePanel } from "@yonder/ui-shell";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SocialPersona } from "./social-settings.tsx";

export const CHAT_BOT_PAGE_TITLE = {
	profile: "bots.basicProfile",
	persona: "members.social.personaTitle",
	channels: "channels.title",
	external: "channels.externalConversations",
} as const;

export type ChatBotPage = keyof typeof CHAT_BOT_PAGE_TITLE;

export function chatBotPageStack(page: ChatBotPage | undefined): ChatBotPage[] {
	if (page === "external") return ["channels", "external"];
	return page ? [page] : [];
}

export function ChatBotSettings({
	bot,
	onDeleted,
	onOpenPage,
	preferences,
}: {
	bot: Member;
	onDeleted: (chatId: string | undefined) => void;
	onOpenPage?: (page: ChatBotPage) => void;
	preferences?: ReactNode;
}) {
	const { t } = useTranslation();
	const side = useSidePanel();
	function open(page: ChatBotPage) {
		if (onOpenPage) return onOpenPage(page);
		const key = `bot-settings:${bot.id}:${page}`;
		side.push({
			key,
			title: t(CHAT_BOT_PAGE_TITLE[page]),
			content: (
				<ChatBotSettingsChild
					bot={bot}
					page={page}
					back={() => side.back(key)}
					onOpenExternal={() => open("external")}
				/>
			),
		});
	}
	return (
		<ChatSettingsBody>
			<BotSettingsOverview
				bot={bot}
				onEdit={() => open("profile")}
				onPersona={() => open("persona")}
				onChannels={() => open("channels")}
				onDeleted={onDeleted}
			/>
			{preferences}
		</ChatSettingsBody>
	);
}

export function ChatBotSettingsChild({
	bot,
	page,
	back,
	onDirtyChange,
	onOpenExternal,
}: {
	bot: Member;
	page: ChatBotPage;
	back: () => void;
	onDirtyChange?: ((dirty: boolean) => void) | undefined;
	onOpenExternal: () => void;
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
						<SocialPersona botId={bot.id} onCancel={back} onSaved={back} onDirtyChange={onDirtyChange} />
					</>
				);
			case "channels":
				return <FeishuChannel botId={bot.id} onOpenExternal={onOpenExternal} />;
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
		<BotForm mode="edit" bot={bot} onSaved={back} onCancel={back} onDirtyChange={onDirtyChange} />
	) : null;
}

function ChatSettingsBody({ children }: { children: ReactNode }) {
	return <div className="flex flex-col gap-[var(--spacing-4)] p-[var(--spacing-4)]">{children}</div>;
}
