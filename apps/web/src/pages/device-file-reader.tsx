import { deviceFileChild, deviceFileName } from "@yonder/chat-model";
import type { ConnectorInstance } from "@yonder/protocol";
import { Button, IconButton } from "@yonder/ui-components";
import { type SidePage, SidePageActions, useOptionalSidePanel, useShellChrome } from "@yonder/ui-shell";
import { ICON_SIZE } from "@yonder/ui-tokens";
import { Download, File, Folder, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDeviceFilePreview } from "../lib/device-file-preview-session.ts";
import { AttachmentReader } from "../preview/attachment-preview.tsx";
import { previewKind } from "../preview/file-kind.ts";
import { usePreviewTranslation } from "../preview/preview-i18n.ts";
import { TextPreviewViewport } from "../preview/text-preview.tsx";
import { MessageContent } from "./message-content.tsx";

export function deviceFilePage(source: ConnectorInstance, path: string): SidePage {
	return {
		key: `device-file:${source.deviceId}:${source.id}:${path}`,
		title: `${deviceFileName(path)} · ${source.deviceName}`,
		icon: <File size={ICON_SIZE.sm} aria-hidden="true" />,
		content: <DeviceFileReader source={source} path={path} />,
	};
}

function DeviceFileReader({ source, path }: { source: ConnectorInstance; path: string }) {
	const { t } = useTranslation();
	const side = useOptionalSidePanel();
	const { desktop } = useShellChrome();
	const previewTranslation = usePreviewTranslation();
	const { document, progress, refresh, more, download } = useDeviceFilePreview(source, path);
	const { checking, downloading, downloadError, error, paging, status } = progress;
	const notice = downloadError ?? status;
	const directory = document && "directory" in document ? document.directory : undefined;
	const file = document && "head" in document && document.head.kind === "file" ? document.head : undefined;
	const paged = document && "pages" in document ? document : undefined;

	return (
		<section data-device-file-reader className="flex h-full min-h-0 flex-col">
			{checking || notice ? (
				<SidePageActions className="flex flex-wrap items-center gap-[var(--spacing-2)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]">
					<span className="me-auto flex flex-wrap items-center gap-[var(--spacing-2)]">
						{checking ? (
							<LoaderCircle
								role="status"
								aria-label={t("deviceFiles.checking")}
								className="animate-spin motion-reduce:animate-none"
								size={16}
							/>
						) : null}
						{notice ? <span role="status">{t(notice)}</span> : null}
						{notice && !checking && !downloading ? (
							<Button size="sm" variant="link" onClick={downloadError ? download : refresh}>
								{t("app.retry")}
							</Button>
						) : null}
					</span>
				</SidePageActions>
			) : null}
			{directory ? (
				<div className="min-h-0 flex-1 overflow-y-auto p-[var(--spacing-3)]">
					{directory.entries.length ? (
						<ul>
							{[...directory.entries]
								.sort(
									(a, b) =>
										Number(b.type === "directory") - Number(a.type === "directory") || a.name.localeCompare(b.name),
								)
								.map((entry) => {
									const child = deviceFileChild(path, entry.name);
									if (!child) return null;
									const Icon = entry.type === "directory" ? Folder : File;
									return (
										<li key={entry.name}>
											<button
												type="button"
												className="flex w-full items-center gap-[var(--spacing-2)] rounded-[var(--radius-control-sm)] p-[var(--spacing-2)] text-start hover:bg-[var(--color-bg-hover)]"
												onClick={() => {
													const page = deviceFilePage(source, child);
													if (entry.type === "directory") side?.push(page);
													else side?.open(page);
												}}
											>
												<Icon size={16} aria-hidden="true" className="shrink-0" />
												<span className="min-w-0 break-words">{entry.name}</span>
											</button>
										</li>
									);
								})}
						</ul>
					) : (
						<p role="status">{t("deviceFiles.emptyDirectory")}</p>
					)}
					{directory.truncated ? (
						<p role="status" className="text-caption text-[var(--color-text-secondary)]">
							{t("deviceFiles.partialDirectory")}
						</p>
					) : null}
				</div>
			) : paged ? (
				<section
					className="attachment-reader attachment-reader-pane min-h-0 flex-1"
					data-attachment-pane-reader
					data-inline-actions={desktop ? undefined : "file"}
				>
					<SidePageActions placement="title">
						<div className={desktop ? "flex items-center gap-[var(--spacing-1)]" : "attachment-reader-inline-actions"}>
							<IconButton
								size="sm"
								onClick={download}
								disabled={checking || downloading}
								aria-label={previewTranslation("download")}
								title={previewTranslation("download")}
							>
								{downloading ? (
									<LoaderCircle className="animate-spin motion-reduce:animate-none" size={20} aria-hidden="true" />
								) : (
									<Download size={20} aria-hidden="true" />
								)}
							</IconButton>
						</div>
					</SidePageActions>
					<TextPreviewViewport
						onReachEnd={!checking && !paging && !error && paged.pages.at(-1)?.nextOffset != null ? more : undefined}
					>
						{paged.head.nextOffset === null && previewKind(paged.head) === "markdown" ? (
							<article className="attachment-document-content" key={paged.head.sha256}>
								<MessageContent body={paged.head.content} />
							</article>
						) : (
							<pre className="attachment-text-content" key={paged.head.sha256}>
								{paged.pages.map((page) => page.content)}
							</pre>
						)}
						{paging ? (
							<LoaderCircle
								role="status"
								aria-label={t("deviceFiles.checking")}
								className="animate-spin motion-reduce:animate-none"
								size={16}
							/>
						) : null}
						{error ? (
							<p className="attachment-reader-notice" role="status">
								{t(error)}{" "}
								<Button size="sm" variant="link" onClick={status ? refresh : more}>
									{t("app.retry")}
								</Button>
							</p>
						) : null}
					</TextPreviewViewport>
				</section>
			) : file ? (
				<div className="min-h-0 flex-1">
					<AttachmentReader file={{ name: file.name, mimeType: file.blob.type, blob: file.blob }} />
				</div>
			) : null}
		</section>
	);
}
