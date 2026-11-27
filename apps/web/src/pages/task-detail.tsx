import { Button, TaskGlyph } from "@yonder/ui-components";
import { ApiError, useItem } from "@yonder/ui-data";
import { useOptionalSidePanel } from "@yonder/ui-shell";
import { ICON_SIZE } from "@yonder/ui-tokens";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { itemFailure, itemTrailingKey } from "./items-format.ts";
import { memoryFileRoute, useOpenMemoryFile } from "./memory/memory-file-detail.tsx";
import { pathLastSegment } from "./memory/memory-view.ts";
import { MessageContent } from "./message-content.tsx";
import { FullTaskLink } from "./task-open-link.tsx";

export function useOpenTaskDetail() {
	const side = useOptionalSidePanel();
	return (id: string, title: string): boolean => {
		if (!side) return false;
		side.open({
			key: `task:${id}`,
			title,
			icon: <TaskGlyph size={ICON_SIZE.sm} aria-hidden="true" />,
			content: <TaskDetail id={id} />,
		});
		return true;
	};
}

export function TaskOutputFiles({ paths }: { paths: readonly string[] }) {
	const open = useOpenMemoryFile();
	return paths.length ? (
		<ul className="flex flex-col gap-[var(--spacing-2)]">
			{[...new Set(paths)].map((path) => (
				<li key={path}>
					<Link
						to={memoryFileRoute(path)}
						className="inline-flex max-w-full items-center gap-[var(--spacing-2)] text-[var(--color-accent-text)] underline-offset-2 hover:underline"
						onClick={(event) => {
							if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
							event.preventDefault();
							open(path);
						}}
					>
						<FileText size={16} aria-hidden="true" className="shrink-0" />
						<span className="truncate">{pathLastSegment(path)}</span>
					</Link>
				</li>
			))}
		</ul>
	) : null;
}

function TaskDetail({ id }: { id: string }) {
	const { t, i18n } = useTranslation();
	const query = useItem(id);
	const item = query.data;
	if (!item)
		return (
			<div className="p-[var(--spacing-4)] text-[var(--color-text-secondary)]" role="status">
				{t(
					query.error instanceof ApiError && query.error.code === "not_found"
						? "tasks.itemNotFound"
						: query.isError
							? "app.loadFailed"
							: "app.loading",
				)}
				{query.isError ? (
					<Button variant="link" onClick={() => void query.refetch()}>
						{t("app.retry")}
					</Button>
				) : null}
			</div>
		);
	const text = item.result || (item.source === "conversation" ? null : item.instruction);
	const state = itemTrailingKey(item);
	const start = new Date(item.startedAt);
	const started = Number.isFinite(start.valueOf())
		? new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" }).format(start)
		: null;
	return (
		<div data-task-pane-reader className="flex flex-col">
			<div className="flex flex-col gap-[var(--spacing-4)] p-[var(--spacing-4)]">
				<div className="flex items-center gap-[var(--spacing-2)] empty:hidden">
					{state || started ? (
						<p className="flex flex-1 flex-wrap gap-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]">
							{state ? <span>{t(state)}</span> : null}
							{started ? <time dateTime={item.startedAt}>{t("tasks.itemStartedAt", { at: started })}</time> : null}
						</p>
					) : null}
					<FullTaskLink id={id} />
				</div>
				{text ? <MessageContent body={text} /> : null}
				{item.failureReason ? (
					<p role="note">{itemFailure(item.failureReason, i18n.resolvedLanguage ?? i18n.language).text}</p>
				) : null}
				{item.files?.length ? <TaskOutputFiles paths={item.files} /> : null}
			</div>
		</div>
	);
}
