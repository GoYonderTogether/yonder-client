import { systemEventText } from "@yonder/feature-members";
import type { MemoryUpdateChange, MemoryUpdatedSystemEvent } from "@yonder/protocol";
import { Button, cn } from "@yonder/ui-components";
import { useMemoryFile, useMemoryFileActions, useMemoryFileRevisions } from "@yonder/ui-data";
import { Overlay, useDismiss, useShellChrome } from "@yonder/ui-shell";
import { BookmarkCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MemoryDiff } from "./memory/memory-diff.tsx";
import { useOpenMemoryFile } from "./memory/memory-file-detail.tsx";
import { MemoryError, MemoryLoading } from "./memory/memory-status.tsx";

/**
 * 「记忆已更新」under the reply that changed memory (24 第六节). Tapping it shows what this reply
 * changed: a popover under the line on a desktop, a sheet from the bottom on a phone.
 */
export function MemoryUpdatedLine({ messageId, event }: { messageId: string; event: MemoryUpdatedSystemEvent }) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const [open, setOpen] = useState(false);
	const [reverted, setReverted] = useState<ReadonlySet<string>>(new Set());
	const root = useRef<HTMLDivElement>(null);
	const phone = mode === "mobile";
	useDismiss(open && !phone, () => setOpen(false), 5);
	useEffect(() => {
		if (!open || phone) return;
		const outside = (pointer: Event) => {
			if (!root.current?.contains(pointer.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [open, phone]);
	const allReverted = event.changes.length > 0 && event.changes.every((change) => reverted.has(change.path));
	const changes = (
		<MemoryChanges
			changes={event.changes}
			reverted={reverted}
			onReverted={(path) => setReverted((current) => new Set([...current, path]))}
			onOpened={() => setOpen(false)}
		/>
	);
	return (
		<div
			ref={root}
			className="relative mx-auto flex max-w-full flex-col items-center"
			data-message-id={messageId}
			data-message-system
		>
			<button
				type="button"
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="inline-flex min-h-[var(--control-sm)] max-w-full items-center gap-[var(--spacing-1)] rounded-[var(--radius-full)] px-[var(--spacing-3)] text-caption text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
			>
				<BookmarkCheck size={14} aria-hidden className="shrink-0" />
				<span className="truncate">{allReverted ? t("memory.reverted") : systemEventText(event, t)}</span>
			</button>
			{open && phone ? (
				<Overlay
					open
					mode={mode}
					mobilePresentation="sheet"
					title={t("chat.memoryUpdated")}
					closeLabel={t("app.close")}
					onClose={() => setOpen(false)}
				>
					{changes}
				</Overlay>
			) : null}
			{open && !phone ? (
				<div
					role="dialog"
					aria-label={t("chat.memoryUpdated")}
					className="absolute top-full z-30 mt-[var(--spacing-1)] max-h-[60vh] w-[min(520px,90vw)] overflow-y-auto overscroll-contain rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] text-start shadow-[var(--shadow-lg)]"
				>
					{changes}
				</div>
			) : null}
		</div>
	);
}

function MemoryChanges({
	changes,
	reverted,
	onReverted,
	onOpened,
}: {
	changes: MemoryUpdateChange[];
	reverted: ReadonlySet<string>;
	onReverted: (path: string) => void;
	onOpened: () => void;
}) {
	return (
		<div className="flex flex-col divide-y divide-[var(--color-border-subtle)]">
			{changes.map((change) => (
				<Change
					key={`${change.path}:${change.version}`}
					change={change}
					reverted={reverted.has(change.path)}
					onReverted={() => onReverted(change.path)}
					onOpened={onOpened}
				/>
			))}
		</div>
	);
}

/**
 * One changed file. Undo writes back the version from before this reply; a file this reply created
 * is deleted. Once the file changed again after this reply, undoing would throw that later change
 * away, so the real reason takes the button's place and 「打开」 stays.
 */
function Change({
	change,
	reverted,
	onReverted,
	onOpened,
}: {
	change: MemoryUpdateChange;
	reverted: boolean;
	onReverted: () => void;
	onOpened: () => void;
}) {
	const { t } = useTranslation();
	const openFile = useOpenMemoryFile();
	const history = useMemoryFileRevisions(change.path);
	const file = useMemoryFile(change.path);
	const { revert, remove } = useMemoryFileActions();
	const after = history.data?.items.find((item) => item.version === change.version);
	const before = history.data?.items.find((item) => item.version === change.previousVersion);
	const created = change.previousVersion === 0;
	const later = !reverted && (file.data?.version ?? change.version) > change.version;
	const busy = revert.isPending || remove.isPending;
	const error = history.error ?? revert.error ?? remove.error;
	const undo = () => {
		if (created) remove.mutate(change.path, { onSuccess: onReverted });
		else if (before) revert.mutate({ path: change.path, version: before.version }, { onSuccess: onReverted });
	};
	return (
		<section className="flex flex-col gap-[var(--spacing-3)] p-[var(--spacing-4)]">
			<h3 className="text-body font-medium [overflow-wrap:anywhere] text-[var(--color-text-primary)]">
				{change.title || change.path}
			</h3>
			{history.isPending ? <MemoryLoading /> : null}
			{after && (before || created) ? (
				<MemoryDiff before={before?.content ?? ""} after={after.content} />
			) : history.isSuccess ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{t("chat.memoryRevisionUnavailable")}
				</p>
			) : null}
			<div className="flex flex-wrap items-center justify-end gap-[var(--spacing-2)]">
				{later ? (
					<span className="me-auto text-caption text-[var(--color-text-tertiary)]">{t("memory.laterChanged")}</span>
				) : null}
				{reverted ? (
					<span role="status" className="me-auto text-caption text-[var(--color-text-tertiary)]">
						{t("memory.reverted")}
					</span>
				) : null}
				{!(created && reverted) ? (
					<Button
						size="sm"
						onClick={() => {
							onOpened();
							openFile(change.path, change.title);
						}}
					>
						{t("memory.open")}
					</Button>
				) : null}
				{!later && !reverted ? (
					<Button
						size="sm"
						variant="secondary"
						className={cn(busy && "pointer-events-none")}
						loading={busy}
						disabled={!history.isSuccess || (!before && !created)}
						onClick={undo}
					>
						{t("memory.revert")}
					</Button>
				) : null}
			</div>
			{error ? <MemoryError error={error} /> : null}
		</section>
	);
}
