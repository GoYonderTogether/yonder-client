import { conversationBotOwner } from "@yonder/chat-model";
import { BotName } from "@yonder/feature-members";
import type { Conversation, ConversationMember, Member } from "@yonder/protocol";
import { Avatar, cn } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";

export function ConversationAgentHeader({
	agent,
	conversation,
	ownedAgent,
	title,
	statusText,
	working,
	onOpen,
	inline = false,
}: {
	agent: ConversationMember;
	conversation: Conversation;
	ownedAgent: Member | undefined;
	title: string;
	statusText: string | undefined;
	/** The Bot has an accepted reply still running: the name line says so until the reply lands. */
	working: boolean;
	onOpen: (() => void) | undefined;
	inline?: boolean;
}) {
	const { t } = useTranslation();
	const workingLabel = working ? t("chat.agentStatus.working") : undefined;
	const Identity = onOpen ? "button" : "div";
	return (
		<section
			data-chat-agent-title
			aria-label={title}
			className={cn(
				"flex flex-col items-center gap-[var(--spacing-1)]",
				inline ? "min-w-0 max-w-[min(20vi,16em)]" : "px-[var(--spacing-4)]",
			)}
		>
			<Identity
				data-chat-agent-identity={onOpen ? true : undefined}
				className={
					onOpen
						? "flex w-fit max-w-[75%] flex-col items-center gap-[var(--spacing-1)] rounded-[var(--radius-full)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
						: inline
							? "flex min-w-0 max-w-full items-center gap-[var(--spacing-1)]"
							: "contents"
				}
				{...(onOpen
					? { type: "button", "aria-label": t("bots.settings"), "aria-haspopup": "dialog" as const, onClick: onOpen }
					: {})}
			>
				<span data-chat-agent-avatar className="flex">
					<Avatar
						name={title}
						src={agent.avatarUrl}
						color={agent.avatarColor}
						kind="bot"
						size={inline ? 28 : 48}
						className="rounded-[var(--radius-full)]!"
					/>
				</span>
				<span
					data-chat-agent-name
					className={cn(
						"w-fit text-center text-body font-medium text-[var(--color-text-primary)]",
						inline || onOpen ? "min-w-0 max-w-full" : "max-w-[75%]",
					)}
					title={workingLabel ?? title}
				>
					{working ? (
						<span className="block truncate">{workingLabel}</span>
					) : (
						<BotName
							name={title}
							ownedBot={ownedAgent}
							owner={conversationBotOwner(agent, conversation)}
							compact="header"
						/>
					)}
				</span>
			</Identity>
			{!working && statusText ? <ConversationAgentStatus text={statusText} /> : null}
		</section>
	);
}

export function ConversationAgentStatus({ text }: { text: string }) {
	return (
		<div role="status" className="max-w-full text-center text-caption text-[var(--color-text-secondary)]" title={text}>
			<span className="line-clamp-2 wrap-anywhere">{text}</span>
		</div>
	);
}
