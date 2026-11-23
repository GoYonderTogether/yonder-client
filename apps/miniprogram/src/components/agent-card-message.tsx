import { Text, View } from "@tarojs/components";
import { choiceCardView } from "../lib/agent-card-view";
import { t } from "../lib/i18n";
import { MessageOptions } from "../pages/chat/option-card";
import { useAgentCard } from "./use-agent-card";

/**
 * An owner-only Agent card a message points at. The message carries only the reference: the title,
 * the choices and what became of them come from the server. Only the choice card is drawn here (a
 * question, a tier, a group change); any other kind is not this client's to show yet, so it renders
 * nothing rather than a half card.
 */
export function AgentCardMessage({ id, disconnected }: { id: string; disconnected: boolean }) {
	const { card, error, pending, failedAction, act } = useAgentCard(id);
	if (!card) return error ? <Text className="mini-muted">{error}</Text> : null;
	const view = choiceCardView(card, !disconnected && !pending);
	if (!view) return null;
	return (
		<View>
			<MessageOptions
				question={view.question}
				summary={view.summary}
				result={view.result}
				options={view.options}
				images={view.options.map(() => undefined)}
				selected={view.selected}
				onChoose={
					view.open && !disconnected && !pending
						? (label) => {
								const actionId = view.actionFor(label);
								if (actionId) void act(actionId);
							}
						: undefined
				}
			/>
			{error && failedAction ? (
				<Text className="mini-muted">{t("没有成功，请再点一次。", "That did not go through. Tap again.")}</Text>
			) : null}
		</View>
	);
}
