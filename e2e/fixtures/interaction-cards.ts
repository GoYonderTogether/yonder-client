import type {
	Attachment,
	ConnectorRequestDevice,
	ConnectorRequestView,
	Message,
	QuestionCardAction,
} from "@yonder/protocol";
import { message } from "../chat-fixture.ts";

export const cardPhoto: Attachment = {
	id: "interaction-photo",
	kind: "image",
	name: "河畔步道.heic",
	mimeType: "image/heic",
	size: 1,
};
export const cardPhotoPath = "e2e/fixtures/attachment-preview/photo.heic";

export const authMessage = { ...message("interaction-auth-02", null), connectorRequestId: "interaction-request" };
export const authRequest: ConnectorRequestView = {
	id: "interaction-request",
	connectorIds: ["local-files"],
	reason: "用于查找周末计划。",
	state: "pending",
	deviceId: null,
	deviceName: null,
	connectionIds: [],
	failure: null,
};
export const longDeviceName = "设计工作室 · MacBookProForWeekendPlanAndProjectDocumentation2026";
export const authDevices: ConnectorRequestDevice[] = [
	{ id: "preview-macbook", name: "MacBook Pro", platform: "macos", online: true, supported: true },
	{ id: "preview-design-mac", name: longDeviceName, platform: "macos", online: true, supported: true },
	{ id: "preview-macmini", name: "Mac mini", platform: "macos", online: true, supported: true },
	...["家里的 iMac", "客厅的 Mac mini", "前台的 MacBook Air", "会议室的 iMac", "内容团队的 Mac Studio"].map(
		(name, index): ConnectorRequestDevice => ({
			id: `preview-desk-${index}`,
			name,
			platform: "macos",
			online: true,
			supported: true,
		}),
	),
	{ id: "preview-old-mac", name: "离线的 Mac", platform: "macos", online: false, supported: true },
];

export const surveyCard: Message = {
	...message("interaction-survey-04", "周末想先去哪一站？"),
	attachments: [cardPhoto],
	questionCard: {
		state: "open",
		version: 1,
		questions: [
			{
				id: "route",
				question: "周末想先去哪一站？",
				description: "照片里的河畔步道适合散步。",
				imageId: cardPhoto.id,
				kind: "single",
				options: [
					{ id: "riverside", label: "老城河畔" },
					{ id: "market", label: "周末市集" },
				],
				allowCustom: true,
			},
			{
				id: "preferences",
				question: "计划里想加上哪些内容？",
				kind: "multiple",
				options: [
					{ id: "walking", label: "步行路线" },
					{ id: "restaurants", label: "餐厅推荐" },
					{ id: "budget", label: "大致预算" },
				],
			},
			{ id: "notes", question: "还有什么要一起考虑？", kind: "text", required: false },
		],
	},
};
export function timedCard(deadlineAt: string, state: "waiting" | "open" = "waiting"): Message {
	return {
		...message("interaction-timed-06", "周末先按哪条路线安排？", false, state === "waiting"),
		version: state === "waiting" ? 1 : 2,
		questionCard: {
			state,
			deadlineAt,
			version: state === "waiting" ? 1 : 2,
			questions: [
				{
					id: "timed-route",
					question: "周末先按哪条路线安排？",
					description: "到时我会先按河畔路线拟一版。",
					kind: "single",
					options: [
						{ id: "riverside", label: "河畔路线" },
						{ id: "market", label: "市集路线" },
					],
					allowCustom: true,
				},
			],
		},
	};
}

export function settleQuestion(card: Message, action: QuestionCardAction, late = false) {
	const source = card.questionCard;
	if (!source) throw new Error("Expected question card");
	const questions = source.questions;
	const answers = action.action === "answer" ? action.answers : [];
	const body = answers
		.map((answer) => {
			const question = questions.find((item) => item.id === answer.questionId);
			return [
				...(question?.options ?? []).filter((item) => answer.optionIds?.includes(item.id)).map((item) => item.label),
				answer.text,
			]
				.filter(Boolean)
				.join(" · ");
		})
		.join("\n");
	const reply =
		action.action === "answer"
			? {
					...message(`${card.id}-reply-10`, body, true),
					clientNonce: action.clientNonce,
					replyToId: card.id,
					questionReply: { question: questions.map((item) => item.question).join("\n") },
				}
			: undefined;
	return {
		card: {
			...card,
			streaming: false,
			version: card.version + 1,
			questionCard: {
				...source,
				state: reply ? ("answered" as const) : ("skipped" as const),
				version: source.version + 1,
				...(reply ? { answers, answerMessageId: reply.id, answeredLate: late } : {}),
			},
		},
		...(reply ? { message: reply } : {}),
	};
}
