import { systemEventText, type Translate } from "@yonder/feature-members";
import type { Conversation } from "@yonder/protocol";
import { type MarkdownToJSX, parser, RuleType } from "markdown-to-jsx";

/**
 * A group lifecycle message stores an event, not a sentence, so the conversation row builds its
 * words here in the reader's language (19 3.3); every other last message keeps the ordinary preview.
 */
export function rowPreview(conversation: Conversation, t: Translate): string | undefined {
	const last = conversation.lastMessage;
	if (!last) return undefined;
	if (conversation.kind === "system") return t("friendRequests.title");
	if (last.type === "system" && last.system) return systemEventText(last.system, t) || undefined;
	if (last.recordingNote) return t("meetingRecorder.listPreview");
	if (last.voice) return t("chat.voiceMessage");
	return last.body ? messagePreview(last.body) : undefined;
}

/** Keep the conversation row plain text, including when a message contains links. */
export function messagePreview(body: string): string {
	return normalize(text(parser(body, { disableParsingRawHTML: true })));
}

/** Document snippets omit the top heading and discard raw HTML rather than rendering it. */
export function documentPreview(body: string): string {
	const nodes = parser(body);
	if (nodes[0]?.type === RuleType.heading && nodes[0].level === 1) nodes.shift();
	const characters = Array.from(normalize(text(nodes)));
	return characters.length > 180 ? `${characters.slice(0, 180).join("").trimEnd()}…` : characters.join("");
}

function normalize(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function text(nodes: MarkdownToJSX.ASTNode[]): string {
	return nodes
		.map((node) => {
			switch (node.type) {
				case RuleType.text:
				case RuleType.codeInline:
				case RuleType.footnoteReference:
					return node.text;
				case RuleType.codeBlock:
					return `${node.text} `;
				case RuleType.link:
				case RuleType.textFormatted:
					return text(node.children);
				case RuleType.paragraph:
				case RuleType.heading:
				case RuleType.blockQuote:
					return `${text(node.children)} `;
				case RuleType.orderedList:
				case RuleType.unorderedList:
					return `${node.items.map(text).join(" ")} `;
				case RuleType.table:
					return `${[...node.header, ...node.cells.flat()].map(text).join(" ")} `;
				case RuleType.breakLine:
				case RuleType.breakThematic:
					return " ";
				default:
					return "";
			}
		})
		.join("");
}
