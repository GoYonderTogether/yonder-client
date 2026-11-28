import {
	type DeviceFileReference,
	deviceFileScheme,
	isHttpLink,
	linkedDeviceFileReference,
	plainDeviceFileReference,
	quotedDeviceFiles,
} from "@yonder/chat-model";
import { mapMessageText, messageMarkdownOptions, parseMessage } from "@yonder/chat-presentation";
import Markdown, { astToJSX, type MarkdownToJSX, RuleType } from "markdown-to-jsx/react";
import { Fragment, type ReactNode } from "react";
import { DeviceFileLink } from "./device-file-link.tsx";
import { MessageCodeBlock } from "./message-code-block.tsx";
import "./message-content.css";

/** Raw HTML and images are not loaded from untrusted model output. */
export function MessageContent({
	body,
	streaming = false,
	deviceFiles = false,
	sourceAction,
	renderCodeBlock,
}: {
	body: string;
	streaming?: boolean;
	deviceFiles?: boolean;
	sourceAction?: (source: string) => (() => void) | undefined;
	renderCodeBlock?: (language: string | undefined, text: string) => ReactNode;
}) {
	const devicePathNodes = new WeakMap<MarkdownToJSX.ASTNode, DeviceFileReference>();
	function pathNode(reference: DeviceFileReference): MarkdownToJSX.CodeInlineNode {
		const node = { type: RuleType.codeInline, text: reference.path } as const;
		devicePathNodes.set(node, reference);
		return node;
	}
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
		if (node.type === RuleType.link && node.target && /^file:/iu.test(node.target.trim())) {
			return <Fragment key={state.key}>{renderChildren(node.children, state)}</Fragment>;
		}
		if (node.type === RuleType.link && node.target?.startsWith(deviceFileScheme)) {
			const reference = deviceFiles && !streaming ? linkedDeviceFileReference(node.target) : undefined;
			const label = renderChildren(node.children, state);
			return reference ? (
				<DeviceFileLink key={state.key} reference={reference} label={label} />
			) : (
				<Fragment key={state.key}>{label}</Fragment>
			);
		}
		const devicePath = devicePathNodes.get(node);
		if (devicePath) return <DeviceFileLink key={state.key} reference={devicePath} />;
		if (node.type === RuleType.codeBlock && renderCodeBlock) {
			const block = renderCodeBlock(node.lang, node.text);
			if (block != null) return <Fragment key={state.key}>{block}</Fragment>;
		}
		const source = node.type === RuleType.link && node.target?.match(/^#(batch-\d+|photo-[\w-]{1,128})$/u)?.[1];
		if (source && sourceAction && node.type === RuleType.link) {
			const action = sourceAction(source);
			const label = renderChildren(node.children, state);
			return action ? (
				<button key={state.key} type="button" className="message-content-link" onClick={action}>
					{label}
				</button>
			) : (
				<span key={state.key}>{label}</span>
			);
		}
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
	if (deviceFiles && !streaming) {
		const nodes = mapMessageText(parseMessage(body, options), (text, inlineCode) => {
			if (inlineCode) {
				const reference = plainDeviceFileReference(text);
				return [reference ? pathNode(reference) : { type: RuleType.codeInline, text }];
			}
			return deviceFilePathNodes(text, pathNode);
		});
		return astToJSX(nodes, {
			...options,
			wrapperProps: { className: "message-content" } as NonNullable<MarkdownToJSX.Options["wrapperProps"]>,
		});
	}
	return (
		<Markdown className="message-content" options={options}>
			{body}
		</Markdown>
	);
}

function deviceFilePathNodes(
	text: string,
	pathNode: (reference: DeviceFileReference) => MarkdownToJSX.CodeInlineNode,
): MarkdownToJSX.ASTNode[] {
	const nodes: MarkdownToJSX.ASTNode[] = [];
	let offset = 0;
	for (const { index, length, reference } of quotedDeviceFiles(text)) {
		nodes.push({ type: RuleType.text, text: text.slice(offset, index) });
		nodes.push(pathNode(reference));
		offset = index + length;
	}
	nodes.push({ type: RuleType.text, text: text.slice(offset) });
	return nodes;
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
