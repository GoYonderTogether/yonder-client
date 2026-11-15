import Markdown, { type MarkdownToJSX, parser, RuleType } from "markdown-to-jsx";
import { Fragment } from "react";
import "./message-content.css";

/** Raw HTML and images are not loaded from untrusted model output. */
export function MessageContent({ body }: { body: string }) {
	const options: MarkdownToJSX.Options = {
		disableParsingRawHTML: true,
		forceWrapper: true,
		overrides: { img: () => null, table: { props: { tabIndex: 0 } } },
	};
	if (/https?:\/\/[^\s。]*。/i.test(body)) {
		const explicitLinks = collectExplicitLinks(body);
		options.renderRule = (next, node, _renderChildren, state) => {
			if (node.type !== RuleType.link || !node.target || explicitLinks.has(JSON.stringify(node))) return next();
			const text = node.children.length === 1 && node.children[0]?.type === RuleType.text ? node.children[0].text : "";
			// ponytail: `。` can be part of a URL; explicit Markdown preserves it. A source-aware
			// parser could also distinguish identical explicit and bare links in the same message.
			const match = node.target.match(/^(https?:\/\/[a-z\d.-]+(?::\d+)?(?:[/?#][!-~]*)?)(。[\s\S]*)$/i);
			if (!match || text !== node.target) return next();
			return (
				<Fragment key={state.key}>
					<a href={match[1]}>{match[1]}</a>
					{match[2]}
				</Fragment>
			);
		};
	}
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
	visit(parser(body, { disableAutoLink: true, disableParsingRawHTML: true }));
	return links;
}
