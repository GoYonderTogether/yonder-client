import type { MemoryDay } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { ApiError, useMemoryRef } from "@yonder/ui-data";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { REF_LABEL_KEYS, useMemoryFormat } from "./memory-format.ts";
import { type EntryRow, REF_ICONS, rowAt, rowSources, useEntryText } from "./memory-rows.tsx";

export interface OpenEntry {
	row: EntryRow;
	day: MemoryDay;
}

/**
 * Everything behind one entry lives here, not on the page: the sources it came from, and for each
 * source every other moment that cites it. Picking a moment jumps the timeline there.
 */
export function MemoryEntrySheet({
	entry,
	onClose,
	onPick,
}: {
	entry: OpenEntry | null;
	onClose: () => void;
	onPick: (date: string, rowId: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const { mode } = useShellChrome();
	const format = useMemoryFormat();
	const describe = useEntryText();
	const [refId, setRefId] = useState<string | null>(null);
	const close = () => {
		setRefId(null);
		onClose();
	};
	const refs = new Map(entry?.day.refs.map((ref) => [ref.id, ref]) ?? []);
	const text = entry ? describe(entry.row, refs) : null;
	const sources = entry ? [...rowSources(entry.row), ...(entry.day.merged.ref ? [entry.day.merged.ref] : [])] : [];
	return (
		<Overlay
			open={Boolean(entry)}
			mode={mode}
			title={text?.title ?? t("memory.timeline")}
			closeLabel={t("app.close")}
			onClose={close}
			mobilePresentation="sheet"
		>
			{entry && text ? (
				<div className="memory-sheet">
					{refId ? (
						<RefUses
							id={refId}
							onBack={() => setRefId(null)}
							onPick={(date, rowId) => {
								setRefId(null);
								onPick(date, rowId);
							}}
						/>
					) : (
						<>
							<p className="memory-sheet-when">
								{format.date(entry.day.date, i18n.language, false)} {format.time(rowAt(entry.row), i18n.language)}
							</p>
							{text.note ? <p className="memory-sheet-note">{text.note}</p> : null}
							{sources.length ? (
								<>
									<h3>{t("memory.sources")}</h3>
									<ul className="memory-sheet-list">
										{sources.map((id) => {
											const ref = refs.get(id);
											if (!ref) return null;
											const Icon = REF_ICONS[ref.type];
											const merged = id === entry.day.merged.ref;
											return (
												<li key={id}>
													<button type="button" onClick={() => setRefId(id)}>
														<Icon size={16} aria-hidden />
														<span>
															<span>
																{merged ? t("memory.mergedFrom", { count: entry.day.merged.count }) : ref.label}
															</span>
															<span className="memory-sheet-kind">{t(REF_LABEL_KEYS[ref.type])}</span>
														</span>
														<ChevronRight size={16} aria-hidden />
													</button>
												</li>
											);
										})}
									</ul>
								</>
							) : null}
						</>
					)}
				</div>
			) : null}
		</Overlay>
	);
}

function RefUses({
	id,
	onBack,
	onPick,
}: {
	id: string;
	onBack: () => void;
	onPick: (date: string, rowId: string) => void;
}) {
	const { t, i18n } = useTranslation();
	const format = useMemoryFormat();
	const detail = useMemoryRef(id);
	const ref = detail.data?.ref;
	const uses = detail.data?.uses ?? [];
	const year = new Date().getFullYear();
	return (
		<>
			<Button size="sm" variant="ghost" className="memory-sheet-back" onClick={onBack}>
				<ChevronLeft size={16} aria-hidden />
				{t("app.back")}
			</Button>
			{detail.isError ? (
				<p role="alert" className="memory-error">
					{detail.error instanceof ApiError ? t(detail.error.messageKey) : detail.error.message}
				</p>
			) : null}
			{ref ? (
				<>
					<h2 className="memory-sheet-title">{ref.label}</h2>
					{ref.detail ? <p className="memory-sheet-kind">{ref.detail}</p> : null}
					{ref.quote ? <blockquote>{ref.quote}</blockquote> : null}
					{ref.notes.length ? (
						<ul className="memory-sheet-notes">
							{ref.notes.map((note) => (
								<li key={note}>{note}</li>
							))}
						</ul>
					) : null}
					{uses.length ? (
						<>
							<h3>{uses.length > 1 ? t("memory.refUses", { count: uses.length }) : t("memory.refOnce")}</h3>
							<ol className="memory-sheet-list">
								{uses.map((use) => (
									<li key={use.rowId}>
										<button type="button" onClick={() => onPick(use.date, use.rowId)}>
											<span>
												<span>{use.text}</span>
												<time className="memory-sheet-kind" dateTime={use.at}>
													{format.date(use.date, i18n.language, Number(use.date.slice(0, 4)) !== year)}{" "}
													{format.time(use.at, i18n.language)}
												</time>
											</span>
											<ChevronRight size={16} aria-hidden />
										</button>
									</li>
								))}
							</ol>
						</>
					) : null}
				</>
			) : null}
		</>
	);
}
