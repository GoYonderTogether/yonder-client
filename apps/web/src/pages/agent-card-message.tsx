import { isAgentCardId } from "@yonder/chat-model";
import type { AgentCard, CardBody } from "@yonder/protocol";
import { InlineError } from "@yonder/ui-components";
import { ApiError, useAgentCard, useAgentCardActions, usePerson, useSessionStore } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";
import { MessageOptions } from "./message-options.tsx";
import { NamecardReviewCard } from "./namecard-review-card.tsx";

const NAMECARD_PUBLISH = "publish-namecard";

type CardMutation = ReturnType<typeof useAgentCardActions>;
type Choices = Extract<CardBody, { type: "choices" }>;

/**
 * An owner-only Agent card referenced by a message. The message carries only the reference; the
 * card's own title and actions come from the server, never from the message.
 */
export function AgentCardMessage({ id, disconnected }: { id: string; disconnected: boolean }) {
	const { t } = useTranslation();
	const person = usePerson();
	const signedIn = useSessionStore((state) => state.status === "signed-in");
	const enabled = signedIn && !!person?.id && isAgentCardId(id);
	const cardQuery = useAgentCard(id, enabled);
	const mutation = useAgentCardActions(id);
	const card = enabled && cardQuery.data?.id === id ? cardQuery.data : undefined;
	const reason = (error: Error) =>
		error instanceof ApiError ? t(error.messageKey, { defaultValue: error.message }) : error.message;
	// A card the server no longer authorizes for this account simply is not there.
	const hidden = (error: unknown) => error instanceof ApiError && [401, 403, 404].includes(error.status);
	if (!enabled || hidden(cardQuery.error) || hidden(mutation.error)) return null;
	if (cardQuery.error)
		return (
			<InlineError onRetry={() => void cardQuery.refetch()} retryLabel={t("app.retry")}>
				{reason(cardQuery.error)}
			</InlineError>
		);
	if (!card) return null;

	const act = (actionId: string) => {
		if (disconnected || mutation.isPending) return;
		mutation.mutate({ actionId, version: card.version });
	};
	const namecard = card.kind === "card_draft" ? card.namecardReview?.card : undefined;
	// A draft about someone else is not this owner's to confirm.
	if (namecard && (namecard.kind !== "person" || namecard.handle !== person.handle)) return null;
	if (namecard)
		return (
			<NamecardReviewCard
				key={`${card.id}:${card.version}`}
				title={card.title}
				preview={namecard}
				canPublish={card.state === "open" && hasPublishAction(card)}
				busy={mutation.isPending}
				disconnected={disconnected}
				error={namecardError(mutation)}
				onPublish={() => act(NAMECARD_PUBLISH)}
				onRetry={() => act(NAMECARD_PUBLISH)}
			/>
		);
	const choices = card.body?.type === "choices" ? card.body : undefined;
	if (!choices) return null;
	return (
		<QuestionCard
			card={card}
			choices={choices}
			mutation={mutation}
			act={act}
			reason={reason}
			disconnected={disconnected}
		/>
	);
}

/** A question is its title and its answers; only the server decides which one is selected. */
function QuestionCard({
	card,
	choices,
	mutation,
	act,
	reason,
	disconnected,
}: {
	card: AgentCard;
	choices: Choices;
	mutation: CardMutation;
	act: (actionId: string) => void;
	reason: (error: Error) => string;
	disconnected: boolean;
}) {
	const { t } = useTranslation();
	const byLabel = new Map(choices.options.map(({ id, label }) => [label, id]));
	const selected = choices.options.find(({ id }) => id === choices.selected)?.label;
	const retry = mutation.variables?.actionId;
	return (
		<>
			<MessageOptions
				question={card.title}
				preview={card.preview?.kind === "markdown" ? card.preview.text : undefined}
				result={card.result}
				options={choices.options.map(({ label }) => label)}
				images={choices.options.map(() => undefined)}
				selected={selected}
				onChoose={
					card.state === "open" && !disconnected
						? (label) => {
								const actionId = byLabel.get(label);
								if (actionId) act(actionId);
							}
						: undefined
				}
			/>
			{mutation.error ? (
				<InlineError {...(retry && !disconnected ? { onRetry: () => act(retry), retryLabel: t("app.retry") } : {})}>
					{reason(mutation.error)}
				</InlineError>
			) : null}
		</>
	);
}

function hasPublishAction(card: AgentCard) {
	return card.actions?.some(({ id, kind }) => id === NAMECARD_PUBLISH && kind === "answer") === true;
}

function namecardError(mutation: CardMutation): "stale" | "failed" | undefined {
	if (!mutation.error) return undefined;
	return mutation.error instanceof ApiError && mutation.error.status === 409 ? "stale" : "failed";
}
