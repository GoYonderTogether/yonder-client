import { messageMarkdownOptions } from "@yonder/chat-presentation";
import type { MemoryFileContent } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { Link2 } from "lucide-react";
import Markdown, { RuleType } from "markdown-to-jsx";
import { useTranslation } from "react-i18next";

export function MemoryMarkdown({ file, onOpen }: { file: MemoryFileContent; onOpen: (path: string) => void }) {
	const { t } = useTranslation();
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
			{file.links.length ? (
				<ul aria-label={t("memory.linkedFiles")}>
					{Array.from(new Set(file.links), (path) => (
						<li key={path}>
							<Button size="sm" variant="link" className="h-auto text-start wrap-anywhere" onClick={() => onOpen(path)}>
								<Link2 className="size-[var(--spacing-4)] shrink-0" aria-hidden />
								{path}
							</Button>
						</li>
					))}
				</ul>
			) : null}
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
