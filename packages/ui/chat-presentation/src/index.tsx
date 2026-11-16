import "./styles.css";
import "./message.css";

export { type ChatTextHost, StreamingText } from "./streaming-text.tsx";

import { type MarkdownToJSX, parser } from "markdown-to-jsx";
import type { ComponentType, ReactNode, Ref } from "react";

export type ChatHost = ComponentType<{ className?: string; children?: ReactNode; ref?: Ref<unknown> }> | "div";
type Props = { as: ChatHost; children: ReactNode };

export function MessageRun({
	as: Element,
	self,
	avatar,
	sender,
	senderId,
	children,
}: Props & { self: boolean; avatar: ReactNode; sender?: ReactNode; senderId?: string }) {
	return (
		<Element
			data-message-run={senderId}
			data-run-sender={self ? "self" : "other"}
			className={`message-run ${self ? "message-run-outgoing" : ""}`}
		>
			<Element data-message-sender-avatar className="message-run-avatar">
				{avatar}
			</Element>
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
