import type { Run } from "@yonder/protocol";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function RunActivity({ run }: { run: Run | null | undefined }) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const items = run?.activity ?? [];
	if (!items.length) return null;
	const summary =
		items.length > 3
			? `${items
					.slice(0, 2)
					.map((item) => item.label)
					.join(" · ")} · ${t("chat.activityMore", { count: items.length })}`
			: items.map((item) => item.label).join(" · ");
	return (
		<div className="text-caption text-[var(--color-text-secondary)]">
			<button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
				{summary}
				{run?.status === "running" ? <span className="motion-safe:animate-pulse">…</span> : null}
			</button>
			{open ? (
				<ul>
					{items.map((item, index) => (
						// Activities have no persistent identifier and may repeat labels.
						// biome-ignore lint/suspicious/noArrayIndexKey: ordered activity entries
						<li key={`${index}-${item.label}`}>
							<span>{item.label}</span>
							{item.sources?.map((source) => (
								<a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
									{" "}
									{source.site || source.title}
								</a>
							))}
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
