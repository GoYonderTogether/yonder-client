import { systemEventText } from "@yonder/feature-members";
import type { MemoryUpdatedSystemEvent } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { useMemoryFileActions, useMemoryFileRevisions } from "@yonder/ui-data";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { MemoryDiff } from "./memory/memory-diff.tsx";
import { MemoryError } from "./memory/memory-status.tsx";

export function MemoryUpdatedLine({ messageId, event }: { messageId: string; event: MemoryUpdatedSystemEvent }) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const [open, setOpen] = useState(false);
	return (
		<div className="mx-auto max-w-full text-center" data-message-id={messageId} data-message-system>
			<Button
				aria-haspopup="dialog"
				size="sm"
				variant="link"
				className="h-auto min-h-[var(--control-sm)] whitespace-normal break-all"
				onClick={() => setOpen(true)}
			>
				{systemEventText(event, t)}
			</Button>
			{open
				? createPortal(
						<Overlay
							open
							wide
							closeLabel={t("app.close")}
							mobileBackLabel={t("app.back")}
							onClose={() => setOpen(false)}
							title={t("chat.memoryUpdated")}
							mode={mode}
						>
							<MemoryUpdate key={`${event.path}:${event.version}`} {...event} />
						</Overlay>,
						document.body,
					)
				: null}
		</div>
	);
}

function MemoryUpdate({ path, version }: MemoryUpdatedSystemEvent) {
	const { t } = useTranslation();
	const history = useMemoryFileRevisions(path);
	const { revert } = useMemoryFileActions();
	const [confirmation, setConfirmation] = useState<number>();
	const after = history.data?.items.find((item) => item.version === version);
	const before = history.data?.items.find((item) => item.version === version - 1);
	const latest = history.data?.items.reduce((highest, item) => Math.max(highest, item.version), version) ?? version;
	const confirming = latest > version && latest === confirmation && !revert.isSuccess;
	function restore() {
		if (!before) return;
		if (latest > version && latest !== confirmation) {
			setConfirmation(latest);
			return;
		}
		revert.mutate({ path, version: before.version });
	}
	return (
		<div className="flex min-w-0 flex-col gap-[var(--spacing-3)] p-[var(--spacing-5)]">
			<div className="break-all text-caption text-[var(--color-text-secondary)]">{path}</div>
			{history.isPending ? <p role="status">{t("app.loading")}</p> : null}
			{history.error ? <MemoryError error={history.error} retry={() => void history.refetch()} /> : null}
			{!history.error && history.data ? (
				after && (before || version === 1) ? (
					<>
						<MemoryDiff before={before?.content ?? ""} after={after.content} />
						{confirming && before ? (
							<p role="status">{t("chat.memoryRestoreEarlier", { version: before.version })}</p>
						) : null}
						<div className="flex flex-wrap items-center gap-[var(--spacing-2)]">
							<Button
								size="sm"
								variant="secondary"
								loading={revert.isPending}
								disabled={!before || revert.isSuccess || history.isFetching}
								onClick={restore}
							>
								{confirming ? t("memory.restoreVersion", { version: before?.version }) : t("memory.revert")}
							</Button>
							{confirming ? (
								<Button
									size="sm"
									variant="ghost"
									disabled={revert.isPending}
									onClick={() => setConfirmation(undefined)}
								>
									{t("app.cancel")}
								</Button>
							) : null}
							{!before ? <span className="text-caption">{t("chat.memoryNoEarlierRevision")}</span> : null}
							{revert.isSuccess ? <p role="status">{t("chat.memoryReverted")}</p> : null}
						</div>
						{revert.error ? <MemoryError error={revert.error} /> : null}
					</>
				) : (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{t("chat.memoryRevisionUnavailable")}
					</p>
				)
			) : null}
		</div>
	);
}
