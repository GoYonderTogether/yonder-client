import { Checkbox, CheckboxGroup, Input, Label, Radio, RadioGroup, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
	emptyQuestionDraft,
	emptyQuestionDraftAnswer,
	type QuestionDraft,
	type QuestionDraftAnswer,
	questionAnswerText,
	questionDraftAnswers,
	questionDraftPageReady,
} from "@yonder/chat-model";
import { InteractionCard, InteractionCardActions, useQuestionCountdown } from "@yonder/chat-presentation";
import { type Attachment, type Message, QUESTION_ANSWER_MAX_LENGTH, type QuestionPrompt } from "@yonder/protocol";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui";
import { t } from "../../lib/i18n";
import { api, newNonce, useRealtimeRevision } from "../../lib/runtime";
import { ChatView } from "./host";
import { OptionImage } from "./option-card";

function readDraft(key: string): QuestionDraft {
	try {
		const draft = Taro.getStorageSync(key) as QuestionDraft | undefined;
		if (draft && Number.isInteger(draft.page) && draft.page >= 0 && draft.answers) return draft;
	} catch {
		// The editable draft can still be kept in this page's memory.
	}
	return emptyQuestionDraft;
}

function QuestionEditor({
	question,
	attachments,
	selected,
	busy,
	onChange,
}: {
	question: QuestionPrompt;
	attachments: readonly Attachment[];
	selected: QuestionDraftAnswer;
	busy: boolean;
	onChange: (answer: QuestionDraftAnswer) => void;
}) {
	const multiple = question.kind === "multiple";
	const ChoiceControl = multiple ? Checkbox : Radio;
	const files = new Map(attachments.filter((file) => file.kind === "image").map((file) => [file.id, file]));
	const image = question.imageId ? files.get(question.imageId) : undefined;
	const choices = (question.options ?? []).map(({ id, label, imageId }) => ({
		value: `option:${id}`,
		label,
		file: imageId ? files.get(imageId) : undefined,
		checked: selected.optionIds.includes(id),
	}));
	if (question.allowCustom)
		choices.push({ value: "custom", label: t("自填", "Other"), checked: Boolean(selected.custom), file: undefined });
	const changeChoices = (values: string[]) =>
		onChange({
			...selected,
			optionIds: values.filter((value) => value.startsWith("option:")).map((value) => value.slice("option:".length)),
			custom: values.includes("custom"),
		});
	const rows = choices.map(({ value, label, file, checked }) => (
		<Label key={value}>
			<View className={`interaction-card-choice${checked ? " interaction-card-choice-selected" : ""}`}>
				<ChoiceControl className="mini-question-choice-control" value={value} checked={checked} disabled={busy} />
				<View className="mini-question-choice-body">
					<Text>{label}</Text>
					{file ? <OptionImage file={file} /> : null}
				</View>
			</View>
		</Label>
	));
	const field = {
		className: "interaction-card-field",
		maxlength: QUESTION_ANSWER_MAX_LENGTH,
		value: selected.text,
		disabled: busy,
	};
	return (
		<>
			{image ? <OptionImage file={image} /> : null}
			{question.kind === "single" ? (
				<RadioGroup
					className="interaction-card-choices"
					ariaLabel={question.question}
					onChange={({ detail }) => changeChoices([detail.value])}
				>
					{rows}
				</RadioGroup>
			) : multiple ? (
				<CheckboxGroup
					className="interaction-card-choices"
					ariaLabel={question.question}
					onChange={({ detail }) => changeChoices(detail.value)}
				>
					{rows}
				</CheckboxGroup>
			) : null}
			{question.kind === "text" ? (
				<Textarea
					{...field}
					className="interaction-card-field mini-question-textarea"
					ariaLabel={question.question}
					placeholder={question.required === false ? t("可留空", "Optional") : undefined}
					onInput={({ detail }) => onChange({ ...selected, text: detail.value })}
				/>
			) : question.allowCustom && selected.custom ? (
				<Input
					{...field}
					ariaLabel={t("自填答案", "Your own answer")}
					onInput={({ detail }) => onChange({ ...selected, text: detail.value })}
				/>
			) : null}
		</>
	);
}

export function QuestionMessageCard({
	message,
	card,
	ownerId,
	onMessages,
}: {
	message: Message;
	card: NonNullable<Message["questionCard"]>;
	ownerId: string;
	onMessages: (card: Message, reply?: Message) => void;
}) {
	const { id } = message;
	const { questions } = card;
	const key = `yonder.mini.draft.question.${ownerId}.${id}`;
	const pending = card.state === "waiting" || card.state === "open";
	const seconds = useQuestionCountdown(card.state === "waiting" ? card.deadlineAt : undefined);
	const late = Boolean(card.deadlineAt && (card.state === "open" || seconds === 0));
	const [draft, setDraft] = useState(() => readDraft(key));
	const [expanded, setExpanded] = useState(false);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	const action = useRef<{ signature: string; nonce: string } | null>(null);
	const writing = useRef(false);
	const realtimeRevision = useRealtimeRevision();
	const previousRevision = useRef(realtimeRevision);
	const deliver = useRef(onMessages);
	deliver.current = onMessages;
	useEffect(() => {
		try {
			if (pending) Taro.setStorageSync(key, draft);
			else Taro.removeStorageSync(key);
		} catch {
			// A full store should not prevent an answer.
		}
	}, [draft, key, pending]);
	useEffect(() => {
		const changed = previousRevision.current !== realtimeRevision;
		previousRevision.current = realtimeRevision;
		if (!changed || !pending) return;
		let active = true;
		void api
			.questionCard(id)
			.then((next) => {
				if (active) deliver.current(next);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [id, pending, realtimeRevision]);
	const page = pending ? Math.min(draft.page, questions.length - 1) : 0;
	const question = questions[page];
	if (!question) return null;
	const answers = questionDraftAnswers(questions, draft);
	const canFinish = answers.length > 0 && questions.every((prompt) => questionDraftPageReady(prompt, draft));
	const selected = draft.answers[question.id] ?? emptyQuestionDraftAnswer;
	const updateSelected = (value: QuestionDraftAnswer) =>
		setDraft((current) => ({
			...current,
			answers: { ...current.answers, [question.id]: value },
		}));
	const submit = async (kind: "answer" | "skip") => {
		if (writing.current || !pending || (kind === "answer" && !canFinish)) return;
		writing.current = true;
		setBusy(true);
		setFailed(false);
		const signature = JSON.stringify(kind === "answer" ? answers : kind);
		if (action.current?.signature !== signature) action.current = { signature, nonce: newNonce() };
		const input = { version: card.version, clientNonce: action.current.nonce };
		try {
			const result =
				kind === "answer"
					? await api.answerQuestionCard(id, { ...input, action: "answer", answers })
					: await api.skipQuestionCard(id, input);
			deliver.current(result.card, result.message);
		} catch {
			setFailed(true);
			try {
				deliver.current(await api.questionCard(id));
			} catch {
				/* The same answer can be retried. */
			}
		} finally {
			writing.current = false;
			setBusy(false);
		}
	};
	const settled = questions.flatMap((prompt) => {
		const answer = questionAnswerText(
			prompt,
			card.answers?.find((item) => item.questionId === prompt.id),
		);
		return answer ? [{ prompt, answer }] : [];
	});
	const marker = [
		pending && questions.length > 1 ? `${page + 1} / ${questions.length}` : "",
		seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "",
		pending && late ? t("仍可回复", "You can still reply") : "",
		card.answeredLate ? t("补答", "Late reply") : "",
	]
		.filter(Boolean)
		.join(" · ");
	return (
		<InteractionCard
			as={ChatView}
			label={question.question}
			title={question.question}
			detail={pending ? question.description : undefined}
			glyph={<Text ariaHidden>?</Text>}
			marker={marker ? <Text ariaRole={seconds ? "timer" : undefined}>{marker}</Text> : undefined}
		>
			{pending ? (
				<>
					<QuestionEditor
						key={question.id}
						question={question}
						attachments={message.attachments}
						selected={selected}
						busy={busy}
						onChange={updateSelected}
					/>
					{failed ? (
						<Text ariaRole="alert" className="mini-error">
							{t("回复失败，请重试", "Could not reply. Try again.")}
						</Text>
					) : null}
					<InteractionCardActions as={ChatView}>
						{page > 0 ? (
							<Button secondary disabled={busy} onClick={() => setDraft({ ...draft, page: page - 1 })}>
								{t("上一步", "Back")}
							</Button>
						) : (
							<Button secondary disabled={busy} onClick={() => void submit("skip")}>
								{t("跳过", "Skip")}
							</Button>
						)}
						{page < questions.length - 1 ? (
							<Button
								disabled={busy || !questionDraftPageReady(question, draft)}
								onClick={() => setDraft({ ...draft, page: page + 1 })}
							>
								{t("下一步", "Next")}
							</Button>
						) : (
							<Button loading={busy} disabled={!canFinish} onClick={() => void submit("answer")}>
								{late ? t("补答", "Reply now") : questions.length > 1 ? t("提交", "Submit") : t("回复", "Reply")}
							</Button>
						)}
					</InteractionCardActions>
				</>
			) : card.state === "answered" ? (
				<View className="interaction-card-result">
					<View className="interaction-card-answer" ariaRole="status">
						<Text className="interaction-card-answer-icon" ariaHidden>
							✓
						</Text>
						<Text>{settled[0]?.answer ?? t("已答复", "Answered")}</Text>
					</View>
					{expanded ? (
						<View className="interaction-card-breakdown">
							{settled.map(({ prompt, answer }) => (
								<View key={prompt.id} className="interaction-card-result">
									<Text className="interaction-card-status">{prompt.question}</Text>
									<Text>{answer}</Text>
								</View>
							))}
						</View>
					) : null}
					{settled.length > 1 ? (
						<InteractionCardActions as={ChatView}>
							<Button secondary onClick={() => setExpanded(!expanded)}>
								{expanded ? t("收起", "Collapse") : t("查看全部回答", "Show all answers")}
							</Button>
						</InteractionCardActions>
					) : null}
				</View>
			) : (
				<Text className="interaction-card-status" ariaRole="status">
					{card.state === "skipped" ? t("已跳过", "Skipped") : t("已取消", "Cancelled")}
				</Text>
			)}
		</InteractionCard>
	);
}
