import type { QuestionPrompt } from "@yonder/protocol";
import { expect, test } from "vitest";
import {
	type QuestionDraft,
	questionAnswerText,
	questionDraftAnswers,
	questionDraftPageReady,
} from "./question-cards.ts";

test("submits custom answers and selected IDs in prompt order, omitting blank optional prompts", () => {
	const questions = [
		{
			id: "first",
			question: "First?",
			kind: "single",
			allowCustom: true,
			options: [{ id: "a", label: "A" }],
		},
		{ id: "optional", question: "Anything else?", kind: "text", required: false },
		{
			id: "last",
			question: "Last?",
			kind: "multiple",
			options: [
				{ id: "a", label: "A" },
				{ id: "b", label: "B" },
			],
		},
	] satisfies [QuestionPrompt, QuestionPrompt, QuestionPrompt];
	const custom = { custom: true, optionIds: ["a"], text: "  Something else  " };
	const draft: QuestionDraft = {
		page: 2,
		answers: {
			first: custom,
			last: { optionIds: ["b", "a", "missing"], text: "" },
		},
	};
	expect(questions.every((question) => questionDraftPageReady(question, draft))).toBe(true);
	const answers = questionDraftAnswers(questions, draft);
	expect(answers).toEqual([
		{ questionId: "first", text: "Something else" },
		{ questionId: "last", optionIds: ["a", "b"] },
	]);
	expect(questionAnswerText(questions[2], answers[1])).toBe("A · B");
	custom.text = " ";
	expect(questionDraftPageReady(questions[0], draft)).toBe(false);
});
