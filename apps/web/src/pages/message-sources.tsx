import { runSources } from "@yonder/chat-model";
import type { Run } from "@yonder/protocol";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function MessageSources({ run }: { run: Run | null | undefined }) {
	const { t } = useTranslation();
	const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
	const sources = runSources(run);
	if (!sources.length) return null;
	const open = expandedRunId === run?.id;
	return (
		<div className="text-caption text-[var(--color-text-secondary)]">
			<button type="button" aria-expanded={open} onClick={() => setExpandedRunId(open ? null : (run?.id ?? null))}>
				{t("chat.sources")}
			</button>
			{open ? (
				<ul>
					{sources.map((source) => (
						<li key={JSON.stringify(source)}>
							<a href={source.url} target="_blank" rel="noopener noreferrer">
								{source.title || source.site || source.url}
							</a>
							{source.site && source.site !== source.title ? <span> · {source.site}</span> : null}
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
