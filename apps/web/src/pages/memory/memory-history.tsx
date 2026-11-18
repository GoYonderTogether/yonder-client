import type { MemoryFileContent } from "@yonder/protocol";
import { Button, ListGroup, ListRow } from "@yonder/ui-components";
import { useMemoryFileActions, useMemoryFileRevisions } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MemoryDiff } from "./memory-diff.tsx";
import { MemoryError } from "./memory-status.tsx";

const AUTHORS: Record<string, string> = {
	bot: "memory.authorBot",
	checkpoint: "memory.authorCheckpoint",
	digest: "memory.authorDigest",
	router: "memory.authorRouter",
	user: "memory.userEdited",
	system: "memory.authorSystem",
};

export function MemoryHistory({ file, owner }: { file: MemoryFileContent; owner: boolean }) {
	const { t, i18n } = useTranslation();
	const query = useMemoryFileRevisions(file.path);
	const { revert } = useMemoryFileActions();
	const [version, setVersion] = useState<number>();
	const revisions = query.data?.items.toSorted((left, right) => right.version - left.version) ?? [];
	const index = revisions.findIndex((revision) => revision.version === version);
	const selected = revisions[index];
	const previous = revisions[index + 1];
	const dateTime = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
		dateStyle: "medium",
		timeStyle: "short",
	});

	return (
		<section className="memory-file-body" aria-label={t("memory.history")} aria-busy={query.isPending}>
			{query.error ? <MemoryError error={query.error} retry={() => void query.refetch()} /> : null}
			{query.isPending ? <p className="text-caption">{t("app.loading")}</p> : null}
			{query.isSuccess && !revisions.length ? <p className="text-caption">{t("memory.noRevisions")}</p> : null}
			{revisions.length ? (
				<ListGroup>
					{revisions.map((revision) => {
						const author = AUTHORS[revision.by.split(":")[0] ?? ""];
						return (
							<ListRow
								key={revision.version}
								title={t("memory.version", { version: revision.version })}
								subtitle={
									<>
										<time dateTime={revision.at}>{dateTime.format(new Date(revision.at))}</time>
										{author ? ` · ${t(author)}` : null}
									</>
								}
								selected={revision.version === version}
								disabled={revert.isPending}
								onClick={() => {
									revert.reset();
									setVersion(revision.version === version ? undefined : revision.version);
								}}
							/>
						);
					})}
				</ListGroup>
			) : null}
			{selected ? (
				<>
					<MemoryDiff before={previous?.content ?? ""} after={selected.content} />
					{owner && selected.version !== file.version ? (
						<div>
							<Button
								size="sm"
								loading={revert.isPending}
								onClick={() => revert.mutate({ path: file.path, version: selected.version })}
							>
								{t("memory.restoreVersion", { version: selected.version })}
							</Button>
						</div>
					) : null}
				</>
			) : null}
			{revert.error ? <MemoryError error={revert.error} /> : null}
		</section>
	);
}
