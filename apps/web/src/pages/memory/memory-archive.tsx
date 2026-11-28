import { FolderGlyph, ListGroup, ListRow } from "@yonder/ui-components";
import { useMemoryFiles, useMemoryFolders } from "@yonder/ui-data";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useMinute } from "./memory-format.ts";
import {
	archivedEntries,
	archivedFolderName,
	memoryFileRoute,
	memoryFolderNames,
	memoryFolderRoute,
} from "./memory-view.ts";
import { relativeTime } from "./memory-who.ts";

/**
 * 「已归档」 under every other memory group (WAVE2 2026-11-25 §2): the files the owner put away,
 * folded until they are wanted and gone entirely when nothing is archived. Its folders are the ones
 * the files came from, so a note keeps the path it had before `/archive/`; opening one shows it
 * read-only on its own page.
 */
export function ArchivedGroup() {
	const { t, i18n } = useTranslation();
	const now = useMinute();
	const navigate = useNavigate();
	const query = useMemoryFiles();
	const folders = useMemoryFolders();
	const folderName = memoryFolderNames(folders.data?.items ?? []);
	const [open, setOpen] = useState(false);
	const entries = archivedEntries(query.data?.items ?? []);
	const locale = i18n.resolvedLanguage ?? i18n.language;
	if (!entries.folders.length && !entries.files.length) return null;
	return (
		<ListGroup>
			<li className="border-b border-dashed border-[var(--color-border)] last:border-b-0">
				<button
					type="button"
					aria-expanded={open}
					onClick={() => setOpen(!open)}
					className="flex min-h-[var(--row-height)] w-full items-center gap-[var(--spacing-2)] px-[var(--spacing-4)] text-start text-body text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
				>
					{open ? (
						<ChevronDown size={16} strokeWidth={1.75} aria-hidden />
					) : (
						<ChevronRight size={16} strokeWidth={1.75} aria-hidden />
					)}
					{folderName("/archive")}
				</button>
			</li>
			{open
				? entries.folders.map((folder) => (
						<ListRow
							key={`folder:${folder}`}
							title={archivedFolderName(folder, folderName)}
							leading={<FolderGlyph size={20} aria-hidden />}
							chevron
							onClick={() => navigate(memoryFolderRoute("archived", folder))}
						/>
					))
				: null}
			{open
				? entries.files.map((file) => (
						<ListRow
							key={file.path}
							title={file.title || file.path.split("/").at(-1)}
							subtitle={relativeTime(file.updatedAt, now, locale, t("memory.justNow"))}
							onClick={() => navigate(memoryFileRoute(file.path))}
						/>
					))
				: null}
		</ListGroup>
	);
}
