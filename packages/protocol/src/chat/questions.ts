import type { Message } from "./chat.ts";

export const QUESTION_ANSWER_MAX_LENGTH = 4000;

export interface QuestionOption {
	id: string;
	label: string;
	imageId?: string;
}

export interface QuestionPrompt {
	id: string;
	question: string;
	description?: string;
	imageId?: string;
	kind: "single" | "multiple" | "text";
	options?: QuestionOption[];
	allowCustom?: boolean;
	/** Defaults to true. */
	required?: boolean;
}

export interface QuestionAnswer {
	questionId: string;
	optionIds?: string[];
	text?: string;
}

export interface QuestionCard {
	questions: QuestionPrompt[];
	state: "waiting" | "open" | "answered" | "skipped" | "cancelled";
	/** Present for cards that initially wait in the originating turn. */
	deadlineAt?: string;
	answers?: QuestionAnswer[];
	answerMessageId?: string;
	answeredLate?: boolean;
	version: number;
}

export interface QuestionCardActionInput {
	version: number;
	clientNonce: string;
}

export interface AnswerQuestionCardRequest extends QuestionCardActionInput {
	action: "answer";
	answers: QuestionAnswer[];
}

export type QuestionCardAction = AnswerQuestionCardRequest | (QuestionCardActionInput & { action: "skip" });

export interface QuestionCardActionResponse {
	card: Message;
	message?: Message;
}
