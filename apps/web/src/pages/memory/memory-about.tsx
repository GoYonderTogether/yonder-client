import { Card, Segmented } from "@yonder/ui-components";
import { useMemoryFile } from "@yonder/ui-data";
import { PageFrame, useShellChrome } from "@yonder/ui-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOpenMemoryFile } from "./memory-file-detail.tsx";
import { MemoryMarkdown } from "./memory-markdown.tsx";
import { MemoryError, MemoryLoading } from "./memory-status.tsx";
import { ABOUT_PATHS } from "./memory-view.ts";

const FACETS = ["memory.impression", "memory.recent", "memory.profile"] as const;

function ProfileFile({ path }: { path: (typeof ABOUT_PATHS)[number] }) {
	const { t } = useTranslation();
	const openFile = useOpenMemoryFile();
	const file = useMemoryFile(path);
	if (file.isPending) return <MemoryLoading />;
	if (file.error) return <MemoryError error={file.error} retry={() => void file.refetch()} />;
	return file.data.content.trim() ? (
		<Card>
			<article className="memory-about-document">
				<MemoryMarkdown file={file.data} onOpen={openFile} />
			</article>
		</Card>
	) : (
		<p className="text-body text-[var(--color-text-secondary)]">{t("memory.noContent")}</p>
	);
}

export function MemoryAbout() {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const [path, setPath] = useState<(typeof ABOUT_PATHS)[number]>(ABOUT_PATHS[0]);
	return (
		<PageFrame
			title={<h1>{t("memory.aboutAiTitle")}</h1>}
			afterTopBar={
				<div
					className={`mx-auto w-full max-w-[var(--width-reading)] pb-[var(--spacing-2)] ${mode === "mobile" ? "px-[var(--spacing-4)]" : "px-[var(--spacing-8)]"}`}
				>
					<Segmented
						size="lg"
						aria-label={t("memory.aboutAiTitle")}
						options={ABOUT_PATHS.map((value, index) => ({ value, label: t(FACETS[index] ?? FACETS[0]) }))}
						value={path}
						onChange={(value) => setPath(ABOUT_PATHS.find((candidate) => candidate === value) ?? ABOUT_PATHS[0])}
					/>
				</div>
			}
		>
			<ProfileFile key={path} path={path} />
		</PageFrame>
	);
}
