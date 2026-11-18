import { useMemoryFile } from "@yonder/ui-data";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MemoryMarkdown } from "./memory-markdown.tsx";
import { useOpenMemoryFile } from "./memory-navigation.ts";
import { MemoryError, MemoryLoading } from "./memory-status.tsx";

/**
 * 「当天总结」under a day's title when the day has a daily summary (24 第三节). It unfolds in place;
 * the file is fetched only once it is opened. A day without one shows nothing.
 */
export function DaySummary({ path }: { path: string }) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	return (
		<div className="flex flex-col gap-[var(--spacing-2)] pb-[var(--spacing-2)]">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="inline-flex w-fit items-center gap-[var(--spacing-1)] rounded-[var(--radius-control-sm)] text-caption text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
			>
				<ChevronRight
					size={14}
					aria-hidden
					className={open ? "rotate-90 transition-transform" : "transition-transform"}
				/>
				{t("memory.daySummary")}
			</button>
			{open ? <SummaryBody path={path} /> : null}
		</div>
	);
}

function SummaryBody({ path }: { path: string }) {
	const file = useMemoryFile(path);
	const openFile = useOpenMemoryFile();
	if (file.error) return <MemoryError error={file.error} retry={() => void file.refetch()} />;
	if (file.isPending) return <MemoryLoading />;
	return (
		<div className="rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)] p-[var(--spacing-4)]">
			<MemoryMarkdown file={file.data} onOpen={openFile} />
		</div>
	);
}
