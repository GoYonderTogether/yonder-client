import { emptyQuestionDraftAnswer, questionDraftAnswers, questionDraftPageReady } from "@yonder/chat-model";
import { InteractionCard, InteractionCardActions, useQuestionCountdown } from "@yonder/chat-presentation";
import type { Attachment, QuestionCard as QuestionCardView } from "@yonder/protocol";
import { Button, InlineError, LoadingRow } from "@yonder/ui-components";
import { useQuestionCardAction } from "@yonder/ui-data";
import { ICON_SIZE, ICON_STROKE } from "@yonder/ui-tokens";
import { ListChecks, MessageCircleQuestionMark } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { QuestionCardAnswers, QuestionCardFields } from "./question-card-fields.tsx";
import { useQuestionDraft } from "./use-question-draft.ts";

export function QuestionCard({
	id,
	conversationId,
	personId,
	card,
	attachments,
	disconnected,
}: {
	id: string;
	conversationId: string;
	personId: string | undefined;
	card: QuestionCardView;
	attachments: readonly Attachment[];
	disconnected: boolean;
}) {
	const { t } = useTranslation();
	const mutation = useQuestionCardAction(id, conversationId, personId);
	const attempt = useRef<{ signature: string; nonce: string } | null>(null);
	const remaining = useQuestionCountdown(card.state === "waiting" ? card.deadlineAt : undefined);
	const settled = card.state !== "waiting" && card.state !== "open";
	const { draft, save } = useQuestionDraft(personId, conversationId, id, settled);
	const page = Math.min(draft?.page ?? 0, card.questions.length - 1);
	const answers = card.questions.flatMap((question) => {
		const answer = card.answers?.find((answer) => answer.questionId === question.id);
		return answer ? [{ question, answer }] : [];
	});
	const question = (settled ? answers[0]?.question : card.questions[page]) ?? card.questions[0];
	if (!question) return null;

	const multiple = card.questions.length > 1;
	const last = page === card.questions.length - 1;
	const late = Boolean(card.deadlineAt && (card.state === "open" || remaining === 0));
	const Glyph = multiple ? ListChecks : MessageCircleQuestionMark;
	const disabled = mutation.isPending || !personId;
	const selected = draft?.answers[question.id] ?? emptyQuestionDraftAnswer;
	const outgoing = draft ? questionDraftAnswers(card.questions, draft) : [];
	const pageReady = draft && questionDraftPageReady(question, draft);
	const canSubmit = outgoing.length > 0 && draft && card.questions.every((item) => questionDraftPageReady(item, draft));
	const time = card.answeredLate
		? t("questionCards.lateAnswer")
		: late
			? t("questionCards.lateAvailable")
			: remaining !== null
				? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
				: "";
	const marker = (
		<span className="flex flex-wrap items-baseline gap-[var(--spacing-2)]">
			{multiple && !settled ? (
				<span>
					{page + 1} / {card.questions.length}
				</span>
			) : null}
			{time ? (
				<span role={late ? "status" : settled ? undefined : "timer"}>
					{!late && !settled ? <span className="sr-only">{t("questionCards.timeRemaining")} </span> : null}
					{time}
				</span>
			) : null}
		</span>
	);

	function submit(action: "answer" | "skip") {
		const signature = JSON.stringify(action === "answer" ? outgoing : action);
		if (attempt.current?.signature !== signature) attempt.current = { signature, nonce: crypto.randomUUID() };
		const core = { version: card.version, clientNonce: attempt.current.nonce };
		mutation.mutate(action === "answer" ? { ...core, action, answers: outgoing } : { ...core, action });
	}

	return (
		<InteractionCard
			as="div"
			label={question.question}
			title={question.question}
			detail={settled ? undefined : question.description}
			glyph={<Glyph aria-hidden size={ICON_SIZE.md} strokeWidth={ICON_STROKE.normal} />}
			marker={(multiple && !settled) || time ? marker : undefined}
		>
			{settled ? (
				card.state === "answered" ? (
					<QuestionCardAnswers answers={answers} />
				) : (
					<p className="interaction-card-status" role="status">
						{t(`questionCards.${card.state}`)}
					</p>
				)
			) : !draft && personId ? (
				<LoadingRow label={t("app.loading")} />
			) : (
				<>
					<QuestionCardFields
						question={question}
						answer={selected}
						attachments={attachments}
						disabled={disabled}
						change={(answer) => {
							if (draft) save({ ...draft, answers: { ...draft.answers, [question.id]: answer } });
						}}
					/>
					<InteractionCardActions as="div">
						<Button
							variant="ghost"
							disabled={disabled || disconnected}
							loading={mutation.isPending && mutation.variables?.action === "skip"}
							onClick={() => submit("skip")}
						>
							{t("questionCards.skip")}
						</Button>
						{draft && page > 0 ? (
							<Button disabled={disabled} onClick={() => save({ ...draft, page: page - 1 })}>
								{t("questionCards.back")}
							</Button>
						) : null}
						<Button
							variant="primary"
							loading={mutation.isPending && mutation.variables?.action === "answer"}
							disabled={disabled || (last && disconnected) || !(last ? canSubmit : pageReady)}
							onClick={() => {
								if (last) submit("answer");
								else if (draft) save({ ...draft, page: page + 1 });
							}}
						>
							{t(last ? (multiple ? "questionCards.submit" : "questionCards.reply") : "questionCards.next")}
						</Button>
					</InteractionCardActions>
					{mutation.isError ? <InlineError>{t("questionCards.submitFailed")}</InlineError> : null}
				</>
			)}
		</InteractionCard>
	);
}
