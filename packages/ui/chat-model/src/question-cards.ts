import type { Message, QuestionAnswer, QuestionPrompt } from "@yonder/protocol";

export type QuestionDraftAnswer = { optionIds: string[]; text: string; custom?: boolean };
export type QuestionDraft = { page: number; answers: Record<string, QuestionDraftAnswer> };

export const emptyQuestionDraft: QuestionDraft = { page: 0, answers: {} };
export const emptyQuestionDraftAnswer: QuestionDraftAnswer = { optionIds: [], text: "" };

function draftAnswer(question: QuestionPrompt, draft: QuestionDraft) {
	const selected = draft.answers[question.id] ?? emptyQuestionDraftAnswer;
	const writesText = question.kind === "text" || (question.allowCustom && selected.custom);
	const text = writesText ? selected.text.trim() : "";
	const optionIds =
		question.kind === "text" || (question.kind === "single" && selected.custom)
			? []
			: (question.options ?? []).filter(({ id }) => selected.optionIds.includes(id)).map(({ id }) => id);
	return { text, optionIds, emptyCustom: Boolean(question.allowCustom && selected.custom && !text) };
}

export function questionDraftPageReady(question: QuestionPrompt, draft: QuestionDraft) {
	const { text, optionIds, emptyCustom } = draftAnswer(question, draft);
	return !emptyCustom && (question.required === false || Boolean(text || optionIds.length));
}

export function questionDraftAnswers(questions: readonly QuestionPrompt[], draft: QuestionDraft): QuestionAnswer[] {
	return questions.flatMap((question) => {
		const { text, optionIds } = draftAnswer(question, draft);
		return text || optionIds.length
			? [{ questionId: question.id, ...(optionIds.length ? { optionIds } : {}), ...(text ? { text } : {}) }]
			: [];
	});
}

export function questionAnswerText(question: QuestionPrompt, answer: QuestionAnswer | undefined): string {
	if (!answer) return "";
	return [
		...(question.options ?? []).filter(({ id }) => answer.optionIds?.includes(id)).map(({ label }) => label),
		...(answer.text ? [answer.text] : []),
	].join(" · ");
}

export function attachmentsOutsideQuestionCard(message: Message) {
	if (!message.questionCard) return message.attachments;
	const embedded = new Set(
		message.questionCard.questions.flatMap((question) => [
			question.imageId,
			...(question.options ?? []).map((option) => option.imageId),
		]),
	);
	return message.attachments.filter((file) => !embedded.has(file.id));
}
