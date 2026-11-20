import type { MemoryFileSummary } from "@yonder/protocol";
import { EmptyState, ListGroup, ListRow } from "@yonder/ui-components";
import { useMemoryFiles } from "@yonder/ui-data";
import { Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMinute } from "./memory-format.ts";
import { MemoryError, MemoryLoading } from "./memory-status.tsx";
import { groupPrefix } from "./memory-view.ts";
import { VisibilityMark } from "./memory-visibility.tsx";
import { relativeTime } from "./memory-who.ts";

const DIGEST_GROUPS: Record<string, string> = {
	day: "memory.digestDay",
	week: "memory.digestWeek",
	month: "memory.digestMonth",
};

interface Group {
	key: string;
	/** The top group's name, shown once above its first list. */
	heading: string;
	/** A sub-group's name: a connector's folder or a summary period. */
	title?: string;
	files: MemoryFileSummary[];
}

/**
 * Files grouped by what they are, named rather than shown as paths (24 第五节): notes, sources (one
 * group per connector, named by its folder), summaries (daily, weekly, monthly) and public. The two
 * `/me` files sit on the back of the card and are not repeated here.
 */
export function groupFiles(files: readonly MemoryFileSummary[], t: (key: string) => string): Group[] {
	const newest = (items: MemoryFileSummary[]) => items.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	const under = (prefix: string) => files.filter((file) => file.path.startsWith(prefix));
	const split = (prefix: string) => {
		const groups = new Map<string, MemoryFileSummary[]>();
		for (const file of under(prefix)) {
			const name = file.path.slice(prefix.length).split("/")[0] ?? "";
			groups.set(name, [...(groups.get(name) ?? []), file]);
		}
		return groups;
	};
	const result: Group[] = [];
	const notes = under("/notes/");
	if (notes.length) result.push({ key: "notes", heading: t("memory.notesFolder"), files: newest(notes) });
	for (const [name, items] of split("/sources/"))
		result.push({ key: `sources:${name}`, heading: t("memory.sourcesFolder"), title: name, files: newest(items) });
	const digests = split("/digests/");
	for (const period of Object.keys(DIGEST_GROUPS)) {
		const items = digests.get(period);
		if (items?.length)
			result.push({
				key: `digests:${period}`,
				heading: t("memory.digestsFolder"),
				title: t(DIGEST_GROUPS[period] as string),
				files: newest(items),
			});
	}
	const published = under("/public/");
	if (published.length) result.push({ key: "public", heading: t("memory.publicFolder"), files: newest(published) });
	return result;
}

/** One group's files (a connector, notes, summaries, public); summaries keep their period sub-lists. */
export function MemoryFileList({
	group,
	current,
	onOpen,
}: {
	group: string;
	current: string | null;
	onOpen: (path: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const now = useMinute();
	const query = useMemoryFiles();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	if (query.error) return <MemoryError error={query.error} retry={() => void query.refetch()} />;
	if (query.isPending) return <MemoryLoading />;
	const prefix = groupPrefix(group);
	const groups = prefix
		? groupFiles(
				query.data.items.filter((file) => file.path.startsWith(prefix)),
				t,
			)
		: [];
	if (!groups.length) return <EmptyState icon={<Folder size={24} strokeWidth={1.6} />} title={t("memory.noFiles")} />;
	return (
		<div className="flex flex-col gap-[var(--spacing-5)] py-[var(--spacing-2)]">
			{groups.map((sub) => (
				<ListGroup key={sub.key} title={sub.key.startsWith("digests:") ? sub.title : undefined}>
					{sub.files.map((file) => (
						<ListRow
							key={file.path}
							title={file.title || file.path.split("/").at(-1)}
							subtitle={relativeTime(file.updatedAt, now, locale, t("memory.justNow"))}
							trailing={
								<span className="flex items-center gap-[var(--spacing-2)]">
									{file.draft ? <span className="text-[var(--color-warning)]">{t("memory.pending")}</span> : null}
									<VisibilityMark visibility={file.visibility} />
								</span>
							}
							selected={file.path === current}
							onClick={() => onOpen(file.path)}
						/>
					))}
				</ListGroup>
			))}
		</div>
	);
}
