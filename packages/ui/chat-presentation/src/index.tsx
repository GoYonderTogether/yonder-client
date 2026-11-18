import "./styles.css";
import "./message.css";

export { type ChatTextHost, StreamingText } from "./streaming-text.tsx";

import { type MarkdownToJSX, parser } from "markdown-to-jsx";
import { type ComponentType, type ReactNode, type Ref, useEffect, useReducer } from "react";

export type ChatHost = ComponentType<{ className?: string; children?: ReactNode; ref?: Ref<unknown> }> | "div";
type Props = { as: ChatHost; children: ReactNode };

const MINUTE_MS = 60_000;
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MessageTimeText({ at, locale }: { at: Date; locale: "zh-CN" | "en" }): string {
	const [, tick] = useReducer((value: number) => value + 1, 0);
	const now = new Date();
	const minutesAgo = Math.floor((now.getTime() - at.getTime()) / MINUTE_MS);
	const isRecent = minutesAgo >= -2 && minutesAgo < 10;
	const nextChange = isRecent ? at.getTime() + Math.max(2, minutesAgo + 1) * MINUTE_MS : null;
	useEffect(() => {
		if (nextChange === null) return;
		const timer = setTimeout(tick, Math.max(0, nextChange - Date.now()));
		return () => clearTimeout(timer);
	}, [nextChange]);
	if (isRecent) {
		if (minutesAgo < 2) return locale === "zh-CN" ? "刚刚" : "Just now";
		return locale === "zh-CN" ? `${minutesAgo} 分钟前` : `${minutesAgo} minutes ago`;
	}
	const hours = String(at.getHours()).padStart(2, "0");
	const minutes = String(at.getMinutes()).padStart(2, "0");
	const time = `${hours}:${minutes}`;
	if (at.toDateString() === now.toDateString()) return `${locale === "zh-CN" ? "今天" : "Today"} ${time}`;
	if (locale === "zh-CN") return `${at.getMonth() + 1}月${at.getDate()}日 周${"日一二三四五六"[at.getDay()]} ${time}`;
	return `${WEEKDAYS_EN[at.getDay()]}, ${MONTHS_EN[at.getMonth()]} ${at.getDate()} ${time}`;
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
