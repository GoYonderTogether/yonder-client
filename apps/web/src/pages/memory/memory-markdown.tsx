import { messageMarkdownOptions } from "@yonder/chat-presentation";
import type { MemoryFileContent } from "@yonder/protocol";
import Markdown, { RuleType } from "markdown-to-jsx";

/** The file's Markdown; links to other memory files open them, others stay plain text. */
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
				{file.content}
			</Markdown>
		</div>
	);
}

function resolveFileLink(file: MemoryFileContent, href: string): string | undefined {
	const origin = "https://memory.invalid";
	try {
		const base = file.path.split("/").map(encodeURIComponent).join("/");
		const target = new URL(href, `${origin}${base}`);
		if (target.origin !== origin) return undefined;
		const path = decodeURIComponent(target.pathname);
		return file.links.includes(path) ? path : undefined;
	} catch {
		return undefined;
	}
}
