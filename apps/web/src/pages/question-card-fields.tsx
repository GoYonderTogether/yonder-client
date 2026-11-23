import { type QuestionDraftAnswer, questionAnswerText } from "@yonder/chat-model";
import { InteractionCardActions } from "@yonder/chat-presentation";
import {
	type Attachment,
	QUESTION_ANSWER_MAX_LENGTH,
	type QuestionAnswer,
	type QuestionPrompt,
} from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { ICON_SIZE, ICON_STROKE } from "@yonder/ui-tokens";
import { Check } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCardImage } from "./message-options.tsx";

function QuestionImage({ id, attachments }: { id: string | undefined; attachments: readonly Attachment[] }) {
	const image = attachments.find((file) => file.id === id && file.kind === "image");
	return image ? <MessageCardImage key={image.id} file={image} /> : null;
}

export function QuestionCardFields({
	question,
	answer,
	attachments,
	disabled,
	change,
}: {
	question: QuestionPrompt;
	answer: QuestionDraftAnswer;
	attachments: readonly Attachment[];
	disabled: boolean;
	change: (answer: QuestionDraftAnswer) => void;
}) {
	const { t } = useTranslation();
	const id = useId();
	const multiple = question.kind === "multiple";
	const type = multiple ? "checkbox" : "radio";
	const custom = t("questionCards.custom");
	return (
		<>
			<QuestionImage id={question.imageId} attachments={attachments} />
			{question.kind === "text" ? null : (
				<fieldset className="interaction-card-choices" aria-label={question.question} disabled={disabled}>
					{question.options?.map((option) => {
						const selected = answer.optionIds.includes(option.id);
						return (
							<label
								className={`interaction-card-choice${selected ? " interaction-card-choice-selected" : ""}`}
								key={option.id}
							>
								<input
									type={type}
									name={id}
									checked={selected}
									className="mt-[var(--spacing-1)] shrink-0 accent-[var(--color-accent)]"
									onChange={() => {
										const optionIds = multiple
											? selected
												? answer.optionIds.filter((value) => value !== option.id)
												: [...answer.optionIds, option.id]
											: [option.id];
										change({ ...answer, optionIds, custom: multiple && answer.custom === true });
									}}
								/>
								<span className="message-option-choice">
									<span>{option.label}</span>
									<QuestionImage id={option.imageId} attachments={attachments} />
								</span>
							</label>
						);
					})}
					{question.allowCustom ? (
						<label className={`interaction-card-choice${answer.custom ? " interaction-card-choice-selected" : ""}`}>
							<input
								type={type}
								name={id}
								checked={answer.custom === true}
								className="mt-[var(--spacing-1)] shrink-0 accent-[var(--color-accent)]"
								onChange={(event) =>
									change({
										...answer,
										optionIds: multiple ? answer.optionIds : [],
										custom: event.currentTarget.checked,
									})
								}
							/>
							{custom}
						</label>
					) : null}
				</fieldset>
			)}
			{question.kind === "text" || answer.custom ? (
				<textarea
					aria-label={question.kind === "text" ? question.question : custom}
					className="interaction-card-field resize-y"
					rows={2}
					maxLength={QUESTION_ANSWER_MAX_LENGTH}
					value={answer.text}
					disabled={disabled}
					onChange={(event) => change({ ...answer, text: event.currentTarget.value })}
				/>
			) : null}
		</>
	);
}

export function QuestionCardAnswers({ answers }: { answers: { question: QuestionPrompt; answer: QuestionAnswer }[] }) {
	const { t } = useTranslation();
	const [expanded, setExpanded] = useState(false);
	const id = useId();
	const first = answers[0];
	if (!first) return null;
	return (
		<div className="interaction-card-result">
			<div className="interaction-card-answer">
				<Check
					aria-hidden
					className="interaction-card-answer-icon"
					size={ICON_SIZE.sm}
					strokeWidth={ICON_STROKE.selected}
				/>
				<span className="line-clamp-2">{questionAnswerText(first.question, first.answer)}</span>
			</div>
			{answers.length > 1 ? (
				<>
					<dl id={id} className="interaction-card-breakdown" hidden={!expanded}>
						{expanded
							? answers.slice(1).map(({ question, answer }) => (
									<div key={question.id}>
										<dt className="interaction-card-status">{question.question}</dt>
										<dd className="m-0">{questionAnswerText(question, answer)}</dd>
									</div>
								))
							: null}
					</dl>
					<InteractionCardActions as="div">
						<Button
							size="sm"
							variant="ghost"
							aria-controls={id}
							aria-expanded={expanded}
							onClick={() => setExpanded(!expanded)}
						>
							{t(expanded ? "questionCards.collapseAnswers" : "questionCards.viewAnswers")}
						</Button>
					</InteractionCardActions>
				</>
			) : null}
		</div>
	);
}
