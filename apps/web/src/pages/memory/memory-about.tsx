import { IconButton } from "@yonder/ui-components";
import { useMemoryFile } from "@yonder/ui-data";
import { History, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MemoryCard } from "./memory-card.tsx";
import { UserEditedBadge } from "./memory-edited.tsx";
import { MemoryEditor } from "./memory-editor.tsx";
import { useMinute } from "./memory-format.ts";
import { useOpenHistory } from "./memory-history.tsx";
import { MemoryMarkdown } from "./memory-markdown.tsx";
import { ABOUT_PATHS, useOpenMemoryFile } from "./memory-navigation.ts";
import { MemoryError, MemoryLoading } from "./memory-status.tsx";
import { relativeTime, useAuthorName } from "./memory-who.ts";

const TITLES: Record<(typeof ABOUT_PATHS)[number], string> = {
	"/me/印象.md": "memory.impression",
	"/me/近期.md": "memory.recent",
};

/**
 * 「了解」(24 第四节): the public card others scan, then what the Bot holds about the owner, the two
 * files that go into every turn (the two faces of the card, R27).
 */
export function MemoryAbout() {
	return (
		<div className="flex flex-col gap-[var(--spacing-4)] py-[var(--spacing-2)]">
			<MemoryCard />
			{ABOUT_PATHS.map((path) => (
				<AboutCard key={path} path={path} />
			))}
		</div>
	);
}

function AboutCard({ path }: { path: (typeof ABOUT_PATHS)[number] }) {
	const { t, i18n } = useTranslation();
	const now = useMinute();
	const author = useAuthorName();
	const openHistory = useOpenHistory();
	const openFile = useOpenMemoryFile();
	const file = useMemoryFile(path);
	const [editing, setEditing] = useState(false);
	const title = t(TITLES[path]);
	const data = file.data;
	const empty = data && !data.content.replace(/^#.*$/mu, "").trim();
	return (
		<article
			aria-label={title}
			className="flex flex-col gap-[var(--spacing-3)] rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] p-[var(--card-padding)]"
		>
			<header className="flex items-center gap-[var(--spacing-2)]">
				<h3 className="min-w-0 flex-1 truncate text-h3 text-[var(--color-text-primary)]">{title}</h3>
				{data?.userEdited ? <UserEditedBadge path={path} /> : null}
				{data ? (
					<span className="shrink-0 text-caption text-[var(--color-text-tertiary)]">
						{t("memory.byline", {
							who: author(data),
							when: relativeTime(data.updatedAt, now, i18n.resolvedLanguage ?? i18n.language, t("memory.justNow")),
						})}
					</span>
				) : null}
				{data && !editing ? (
					<>
						<IconButton size="sm" aria-label={t("memory.edit")} onClick={() => setEditing(true)}>
							<Pencil size={16} aria-hidden />
						</IconButton>
						<IconButton size="sm" aria-label={t("memory.history")} onClick={() => openHistory(path, title)}>
							<History size={16} aria-hidden />
						</IconButton>
					</>
				) : null}
			</header>
			{file.isPending ? <MemoryLoading /> : null}
			{file.error ? <MemoryError error={file.error} retry={() => void file.refetch()} /> : null}
			{data && editing ? <MemoryEditor file={data} onDone={() => setEditing(false)} /> : null}
			{data && !editing ? (
				empty ? (
					<p className="text-body text-[var(--color-text-tertiary)]">{t("memory.noContent")}</p>
				) : (
					<MemoryMarkdown file={data} onOpen={openFile} />
				)
			) : null}
		</article>
	);
}
