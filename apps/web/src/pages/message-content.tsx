import { isHttpLink } from "@yonder/chat-model";
import { messageMarkdownOptions, parseMessage, StreamingText } from "@yonder/chat-presentation";
import Markdown, { type MarkdownToJSX, RuleType } from "markdown-to-jsx";
import { Fragment } from "react";
import { MessageCodeBlock } from "./message-code-block.tsx";
import "./message-content.css";

/** Raw HTML and images are not loaded from untrusted model output. */
export function MessageContent({ body, streaming = false }: { body: string; streaming?: boolean }) {
	const options: MarkdownToJSX.Options = {
		...messageMarkdownOptions,
		forceWrapper: true,
		overrides: {
			img: () => null,
			pre: MessageCodeBlock,
			p: { props: { className: "message-content-block message-content-paragraph" } },
			h1: { props: { className: "message-content-block message-content-heading" } },
			h2: { props: { className: "message-content-block message-content-heading" } },
			h3: { props: { className: "message-content-block message-content-heading" } },
			h4: { props: { className: "message-content-block message-content-heading" } },
			h5: { props: { className: "message-content-block message-content-heading" } },
			h6: { props: { className: "message-content-block message-content-heading" } },
			a: { props: { className: "message-content-link" } },
			strong: { props: { className: "message-content-strong" } },
			em: { props: { className: "message-content-em" } },
			del: { props: { className: "message-content-del" } },
			s: { props: { className: "message-content-s" } },
			code: { props: { className: "message-content-inline-code" } },
			blockquote: { props: { className: "message-content-block message-content-blockquote" } },
			ul: { props: { className: "message-content-block message-content-list message-content-list-unordered" } },
			ol: { props: { className: "message-content-block message-content-list message-content-list-ordered" } },
			hr: { props: { className: "message-content-block message-content-rule" } },
			table: { props: { tabIndex: 0, className: "message-content-block message-content-table-scroll" } },
			th: { props: { className: "message-content-table-cell" } },
			td: { props: { className: "message-content-table-cell" } },
		},
	};
	let linkRule: MarkdownToJSX.Options["renderRule"];
	if (/https?:\/\/[^\s。]*。/i.test(body)) {
		const explicitLinks = collectExplicitLinks(body);
		linkRule = (next, node, _renderChildren, state) => {
			if (
				node.type !== RuleType.link ||
				!node.target ||
				!isHttpLink(node.target) ||
				explicitLinks.has(JSON.stringify(node))
			)
				return next();
			const text = node.children.length === 1 && node.children[0]?.type === RuleType.text ? node.children[0].text : "";
			// ponytail: `。` can be part of a URL; explicit Markdown preserves it. A source-aware
			// parser could also distinguish identical explicit and bare links in the same message.
			const match = node.target.match(/^(https?:\/\/[a-z\d.-]+(?::\d+)?(?:[/?#][!-~]*)?)(。[\s\S]*)$/i);
			if (!match || text !== node.target) return next();
			return (
				<Fragment key={state.key}>
					<a className="message-content-link" href={match[1]}>
						{match[1]}
					</a>
					{match[2]}
				</Fragment>
			);
		};
	}
	options.renderRule = (next, node, renderChildren, state) => {
		if (streaming && node.type === RuleType.text) return <StreamingText key={state.key} as="span" text={node.text} />;
		if (
			node.type === RuleType.link &&
			node.target?.startsWith("/files/") &&
			node.children.length === 1 &&
			node.children[0]?.type === RuleType.text
		) {
			const name = node.children[0].text;
			const match = name.match(/^(.+)(\.[^.\s/]+)$/);
			if (match && !name.includes("/"))
				return (
					<a
						key={state.key}
						href={node.target}
						className="message-file-link message-content-link"
						title={name}
						aria-label={name}
					>
						<span className="message-file-stem">{match[1]}</span>
						<span>{match[2]}</span>
					</a>
				);
		}
		return linkRule ? linkRule(next, node, renderChildren, state) : next();
	};
	return (
		<Markdown className="message-content" options={options}>
			{body}
		</Markdown>
	);
}

/** The parser gives automatic and explicit links the same node shape. */
function collectExplicitLinks(body: string): Set<string> {
	const links = new Set<string>();
	function visit(value: unknown): void {
		if (Array.isArray(value)) {
			for (const child of value) visit(child);
		} else if (value && typeof value === "object") {
			if ("type" in value && value.type === RuleType.link) links.add(JSON.stringify(value));
			for (const child of Object.values(value)) visit(child);
		}
	}
	visit(parseMessage(body, { disableAutoLink: true }));
	return links;
}
