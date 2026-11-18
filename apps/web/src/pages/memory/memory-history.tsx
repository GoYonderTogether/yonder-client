import type { MemoryFileRevision } from "@yonder/protocol";
import { Button, ListGroup, ListRow } from "@yonder/ui-components";
import { useMemoryFile, useMemoryFileActions, useMemoryFileRevisions } from "@yonder/ui-data";
import { useSidePanel } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";
import { MemoryDiff } from "./memory-diff.tsx";
import { useMinute } from "./memory-format.ts";
import { MemoryError, MemoryLoading } from "./memory-status.tsx";
import { relativeTime, useAuthorName } from "./memory-who.ts";

/** A file's history, opened in the right-hand side panel (24 第四节); a phone shows it full screen. */
export function useOpenHistory() {
	const { t } = useTranslation();
	const side = useSidePanel();
	return (path: string, title: string) =>
		side.open({
			key: `history:${path}`,
			title: t("memory.historyOf", { title }),
			content: <MemoryHistory path={path} />,
		});
}

/** Versions newest first: when, who, and the first changed line. One opens its difference from now. */
function MemoryHistory({ path }: { path: string }) {
	const { t, i18n } = useTranslation();
	const side = useSidePanel();
	const now = useMinute();
	const author = useAuthorName();
	const file = useMemoryFile(path);
	const query = useMemoryFileRevisions(path);
	const revisions = query.data?.items.toSorted((left, right) => right.version - left.version) ?? [];
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const error = query.error ?? file.error;
	if (error)
		return (
			<div className="p-[var(--spacing-4)]">
				<MemoryError error={error} retry={() => void Promise.all([query.refetch(), file.refetch()])} />
			</div>
		);
	if (query.isPending || file.isPending) return <MemoryLoading />;
	if (!revisions.length)
		return (
			<p className="p-[var(--spacing-5)] text-caption text-[var(--color-text-tertiary)]">{t("memory.noRevisions")}</p>
		);
	return (
		<div className="p-[var(--spacing-4)]">
			<ListGroup>
				{revisions.map((revision, index) => {
					const older = revisions[index + 1];
					const current = revision.version === file.data?.version;
					return (
						<ListRow
							key={revision.version}
							title={
								<>
									{t("memory.version", { version: revision.version })}
									{current ? (
										<span className="ms-[var(--spacing-2)] text-caption text-[var(--color-text-tertiary)]">
											{t("memory.current")}
										</span>
									) : null}
								</>
							}
							subtitle={`${t("memory.byline", {
								who: author({ updatedBy: revision.by, updatedByName: null }),
								when: relativeTime(revision.at, now, locale, t("memory.justNow")),
							})}${summary(revision, older) ? ` · ${summary(revision, older)}` : ""}`}
							chevron={!current}
							disabled={current}
							onClick={() =>
								side.push({
									key: `version:${path}:${revision.version}`,
									title: t("memory.version", { version: revision.version }),
									content: <VersionPage path={path} version={revision.version} />,
								})
							}
						/>
					);
				})}
			</ListGroup>
		</div>
	);
}

/** The first line this version changed, as its one-line summary. */
function summary(revision: MemoryFileRevision, older: MemoryFileRevision | undefined): string {
	const before = new Set((older?.content ?? "").split("\n"));
	return (
		revision.content
			.split("\n")
			.find((line) => line.trim() && !before.has(line))
			?.trim()
			.replace(/^[#>*\-\s]+/u, "") ?? ""
	);
}

/** One version against the file as it is now, and 「恢复到这一版」. */
function VersionPage({ path, version }: { path: string; version: number }) {
	const { t } = useTranslation();
	const side = useSidePanel();
	const file = useMemoryFile(path);
	const query = useMemoryFileRevisions(path);
	const { revert } = useMemoryFileActions();
	const revision = query.data?.items.find((item) => item.version === version);
	if (query.isPending || file.isPending) return <MemoryLoading />;
	const error = query.error ?? file.error;
	if (error || !revision || !file.data)
		return (
			<div className="p-[var(--spacing-4)]">
				{error ? (
					<MemoryError error={error} retry={() => void Promise.all([query.refetch(), file.refetch()])} />
				) : (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{t("chat.memoryRevisionUnavailable")}
					</p>
				)}
			</div>
		);
	return (
		<div className="flex flex-col gap-[var(--spacing-4)] p-[var(--spacing-4)]">
			<MemoryDiff before={file.data.content} after={revision.content} />
			<div className="flex justify-end">
				<Button
					variant="primary"
					loading={revert.isPending}
					disabled={revision.version === file.data.version}
					onClick={() => revert.mutate({ path, version }, { onSuccess: side.close })}
				>
					{t("memory.restoreThis")}
				</Button>
			</div>
			{revert.error ? <MemoryError error={revert.error} /> : null}
		</div>
	);
}
