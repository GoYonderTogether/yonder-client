import "./styles.css";
import "./message.css";
import "./option-card.css";
import "./interaction-card.css";

export { InteractionCard, InteractionCardActions, useQuestionCountdown } from "./interaction-card.tsx";
export { type ChatTextHost, StreamingText } from "./streaming-text.tsx";

import { addDays, formatInstant, localDay, startOfDayInZone } from "@yonder/ui-time";
import { type MarkdownToJSX, parser } from "markdown-to-jsx";
import { type ComponentType, type JSX, type ReactNode, type Ref, useEffect, useReducer } from "react";

export type ChatHost = ComponentType<{ className?: string; children?: ReactNode; ref?: Ref<unknown> }> | "div";
type Props = { as: ChatHost; children: ReactNode };

const MINUTE_MS = 60_000;

/**
 * The label above a run of messages, read in the account's zone (migration 2026-11-25): a message
 * sent at 11:58 UTC says 今天 19:58 in Shanghai on every device of that account, whichever zone the
 * device is in. 「今天」 is the account zone's calendar day, not a 24-hour count, and the label
 * switches at that zone's midnight.
 *
 * The relative labels (刚刚, 5 分钟前) are elapsed time, which no zone changes.
 */
export function MessageTime({
	at,
	zone,
	locale,
	atStart,
	render,
}: {
	at: Date;
	/** The account's zone; every caller passes `useAccountTimeZone()`. */
	zone: string;
	locale: "zh-CN" | "en";
	atStart: boolean;
	render: (text: string) => JSX.Element;
}) {
	const [, tick] = useReducer((value: number) => value + 1, 0);
	const now = new Date();
	const minutesAgo = Math.floor((now.getTime() - at.getTime()) / MINUTE_MS);
	const isRecent = minutesAgo >= -2 && minutesAgo < 10;
	const today = localDay(now, zone);
	const isToday = localDay(at, zone) === today;
	const waitingForStart = atStart && minutesAgo < 5;
	const nextChange =
		waitingForStart || isRecent
			? at.getTime() + Math.max(atStart ? 5 : 2, minutesAgo + 1) * MINUTE_MS
			: isToday
				? startOfDayInZone(addDays(today, 1), zone).getTime()
				: null;
	useEffect(() => {
		if (nextChange === null) return;
		const timer = setTimeout(tick, Math.max(0, nextChange - Date.now()));
		return () => clearTimeout(timer);
	}, [nextChange]);
	if (waitingForStart) return null;
	if (isRecent) {
		if (minutesAgo < 2) return render(locale === "zh-CN" ? "刚刚" : "Just now");
		return render(locale === "zh-CN" ? `${minutesAgo} 分钟前` : `${minutesAgo} minutes ago`);
	}
	const time = formatInstant(at, { zone, locale, style: "time" });
	if (isToday) return render(`${locale === "zh-CN" ? "今天" : "Today"} ${time}`);
	const day = formatInstant(at, { zone, locale, style: "monthDay", width: "short" });
	const weekday = formatInstant(at, { zone, locale, style: "weekday", width: "short" });
	return locale === "zh-CN" ? render(`${day} ${weekday} ${time}`) : render(`${weekday}, ${day} ${time}`);
}

export function MessageRun({
	as: Element,
	self,
	avatar,
	sender,
	senderId,
	children,
}: Props & { self: boolean; avatar?: ReactNode; sender?: ReactNode; senderId?: string }) {
	return (
		<Element
			data-message-run={senderId}
			data-run-sender={self ? "self" : "other"}
			className={`message-run ${self ? "message-run-outgoing" : ""}`}
		>
			{avatar ? (
				<Element data-message-sender-avatar className="message-run-avatar">
					{avatar}
				</Element>
			) : null}
			<Element className="message-run-messages">
				{sender}
				{children}
			</Element>
		</Element>
	);
}
export function MessageBubble({ as: Element, self, children }: Props & { self: boolean }) {
	return (
		<Element className={`message-bubble ${self ? "message-bubble-outgoing" : "message-bubble-incoming"}`}>
			{children}
		</Element>
	);
}
/**
 * A line the chat draws that nobody said: a group change, a memory note or a failed reply. Centred,
 * caption sized, with no avatar and no bubble, so it never reads as a message from the Bot. An
 * action (retry, top up) sits inline after the sentence; `tone="action"` is the only tone that takes
 * the warning colour, because it names something the owner can fix.
 */
export function SystemNotice({
	as: Element,
	tone = "quiet",
	role,
	messageId,
	children,
	action,
}: Props & {
	tone?: "quiet" | "action";
	/** `note` for a fact, `alert` for something that just changed. */
	role?: "note" | "alert";
	/** The failed reply this line stands for, so a test or a link can find it. */
	messageId?: string;
	action?: ReactNode;
}) {
	return (
		<Element
			data-message-system
			data-message-id={messageId}
			role={role}
			className={`system-notice system-notice-${tone}`}
		>
			<Element className="system-notice-row">
				<Element className={`system-notice-text system-notice-text-${tone}`}>{children}</Element>
				{action ? <Element className="system-notice-slot">{action}</Element> : null}
			</Element>
		</Element>
	);
}
export function MessageAttachmentsFrame({ as: Element, self, children }: Props & { self: boolean }) {
	return <Element className={`message-attachments ${self ? "message-attachments-self" : ""}`}>{children}</Element>;
}
export function AttachmentTile({
	as: Element,
	children,
	elementRef,
	id,
}: Props & { elementRef?: Ref<HTMLDivElement>; id?: string }) {
	return (
		<Element ref={elementRef as never} data-attachment-id={id} className="message-attachment">
			{children}
		</Element>
	);
}
export function ComposerFrame({ as: Element, children, dragging }: Props & { dragging?: boolean }) {
	return <Element className={`composer-box ${dragging ? "composer-dragging" : ""}`}>{children}</Element>;
}
export function ComposerLayout({ as: Element, expanded, children }: Props & { expanded: boolean }) {
	return <Element className={`composer-layout ${expanded ? "composer-expanded" : ""}`}>{children}</Element>;
}
export function UploadTile({ as: Element, children, name, kind }: Props & { name?: string; kind?: string }) {
	return (
		<Element className="composer-file" data-attachment-name={name} data-preview-kind={kind}>
			{children}
		</Element>
	);
}
export const messageMarkdownOptions = { disableParsingRawHTML: true } as const;
export function parseMessage(body: string, options: MarkdownToJSX.Options = {}) {
	return parser(body, { ...options, ...messageMarkdownOptions });
}
