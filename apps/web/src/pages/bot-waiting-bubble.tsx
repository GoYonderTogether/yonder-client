import { MessageBubble, MessageRun } from "@yonder/chat-presentation";
import { useTranslation } from "react-i18next";
import "./bot-waiting-bubble.css";

export function BotWaitingBubble() {
	const { t } = useTranslation();
	return (
		<MessageRun as="div" self={false}>
			<div className="self-start" data-bot-waiting>
				<MessageBubble as="div" self={false}>
					<span role="status" className="sr-only">
						{t("chat.agentStatus.typing")}
					</span>
					<span aria-hidden="true" className="bot-waiting-dots">
						<i />
						<i />
						<i />
					</span>
				</MessageBubble>
			</div>
		</MessageRun>
	);
}
