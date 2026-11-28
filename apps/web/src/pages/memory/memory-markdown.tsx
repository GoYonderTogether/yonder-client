import { messageMarkdownOptions } from "@yonder/chat-presentation";
import type { MemoryFileContent } from "@yonder/protocol";
import Markdown, { type MarkdownToJSX, RuleType } from "markdown-to-jsx";
import { EntityLink, entityIdOf } from "./memory-entity-link.tsx";

/**
 * The file's Markdown; links to other memory files open them, `[name](entity:ent_…)` links open the
 * person or organisation they name (02 链接), and others stay plain text.
 */
export function MemoryMarkdown({ file, onOpen }: { file: MemoryFileContent; onOpen: (path: string) => void }) {
	return (
		<div className="memory-file-body">
			<Markdown
				className="memory-markdown"
				options={{
					...messageMarkdownOptions,
					forceWrapper: true,
					overrides: { img: () => null },
					renderRule(next, node, renderChildren, state) {
						if (node.type === RuleType.link && node.target) {
							const entityId = entityIdOf(node.target);
							if (entityId) return <EntityLink key={state.key} id={entityId} text={plainText(node.children)} />;
						}
						if (node.type !== RuleType.link || !node.target || /^(https?:|mailto:|#)/i.test(node.target)) return next();
						const linked = resolveFileLink(file, node.target);
						return linked ? (
							<button key={state.key} type="button" className="memory-markdown-link" onClick={() => onOpen(linked)}>
								{renderChildren(node.children, state)}
							</button>
						) : (
							<span key={state.key}>{renderChildren(node.children, state)}</span>
						);
					},
				}}
			>
				{memoryBody(file.content)}
			</Markdown>
		</div>
	);
}

/**
 * What a file body shows. A leading YAML head is metadata Obsidian keeps, not body text (02 页首元数据):
 * it is not drawn, so a page that gained its `id:` reads as its own words. The opaque contact marker is
 * bookkeeping for the server and is not drawn either. Everything else is the body as written, and the
 * reach block and material index the server adds at read time are Markdown like the rest.
 */
export function memoryBody(content: string): string {
	const normalized = content.replace(/\r\n/gu, "\n");
	let body = normalized;
	if (body.startsWith("---\n")) {
		const end = body.indexOf("\n---", 4);
		// Only an entity head is metadata here; a note that opens with a horizontal rule is body.
		const head = end === -1 ? "" : body.slice(4, end);
		if (end !== -1 && /^id:\s*ent_[0-9A-HJKMNP-TV-Z]{26}\s*$/mu.test(head))
			body = body.slice(end + "\n---".length).replace(/^\n/u, "");
	}
	return body
		.split("\n")
		.filter((line) => !/^<!--\s*contact-member:\s*[A-Za-z0-9_-]+\s*-->$/u.test(line.trim()))
		.join("\n")
		.trim();
}

/** The words a link shows, for a renderer that draws its own node rather than the link's children. */
function plainText(nodes: readonly MarkdownToJSX.ASTNode[] | undefined): string {
	return (nodes ?? [])
		.map((node) => {
			if (node.type === RuleType.text) return node.text;
			const children =
				"children" in node && Array.isArray(node.children) ? (node.children as MarkdownToJSX.ASTNode[]) : [];
			return plainText(children);
		})
		.join("")
		.trim();
}

function resolveFileLink(file: MemoryFileContent, href: string): string | undefined {
	const origin = "https://memory.invalid";
	try {
		const base = (file.linkBasePath ?? file.path).split("/").map(encodeURIComponent).join("/");
		const target = new URL(href, `${origin}${base}`);
		if (target.origin !== origin) return undefined;
		const path = decodeURIComponent(target.pathname);
		return file.links.includes(path) ? path : undefined;
	} catch {
		return undefined;
	}
}
