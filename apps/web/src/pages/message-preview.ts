import { type MarkdownToJSX, parser, RuleType } from "markdown-to-jsx";

/** Keep the conversation row plain text, including when a message contains links. */
export function messagePreview(body: string): string {
	return text(parser(body, { disableParsingRawHTML: true }))
		.replace(/\s+/g, " ")
		.trim();
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
