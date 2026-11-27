import type { MemoryEntry as Entry, MemorySource, MemoryTarget } from "@yonder/protocol";
import { Button, ChatGlyph, MEMORY_KIND_GLYPHS, TaskGlyph } from "@yonder/ui-components";
import { CornerDownRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EntryActions } from "./memory-actions.ts";
import type { IconComponent } from "./memory-format.ts";
import { Material } from "./memory-material.tsx";
import { MemoryThumb } from "./memory-media.tsx";
import { useErrorText } from "./memory-status.tsx";

const SOURCE_ICONS: Record<MemorySource["kind"], IconComponent> = {
	chat: ChatGlyph,
	meeting: MEMORY_KIND_GLYPHS.voice,
	task: TaskGlyph,
};

export const SOURCE_LABELS: Record<MemorySource["kind"], string> = {
	chat: "memory.sourceChat",
	meeting: "memory.sourceMeeting",
	task: "memory.sourceTask",
};

/** What an entry holds once it is opened: the organized account, media, materials, sources and delete. */
export function EntryDrawer({ entry, actions }: { entry: Entry; actions: EntryActions }) {
	return (
		<div className="memory-drawer-body">
			{entry.body ? (
				<p className="memory-drawer-text">{entry.body}</p>
			) : entry.text && entry.size !== "note" ? (
				<p className="memory-drawer-text">{entry.text}</p>
			) : null}
			{entry.quote ? (
				<blockquote className="memory-quote">
					{entry.quote.text}
					<small>{entry.quote.source}</small>
				</blockquote>
			) : null}
			{entry.media.length ? (
				<div className={entry.media.length === 1 ? "memory-gallery memory-gallery-one" : "memory-gallery"}>
					{entry.media.map((media) => (
						<MemoryThumb key={media.attachment.id} media={media} onOpen={actions.onPreview} />
					))}
				</div>
			) : null}
			{entry.materials.length ? (
				<ul className="memory-materials">
					{entry.materials.map((material) => (
						<Material key={material.id} material={material} onPreview={actions.onPreview} />
					))}
				</ul>
			) : null}
			{entry.links.length ? (
				<div className="memory-links">
					{entry.links.map((link) => (
						<button key={`${link.date}-${link.entryId}`} type="button" onClick={() => actions.onLink(link)}>
							<CornerDownRight aria-hidden />
							{link.label}
						</button>
					))}
				</div>
			) : null}
			{entry.sources.length ? <SourceList sources={entry.sources} onSource={actions.onSource} /> : null}
			{entry.deletable ? <DeleteEntry id={entry.id} actions={actions} /> : null}
		</div>
	);
}

/**
 * One row per place the entry was organized from. An actionable row opens the meeting, conversation or scheduled-task list it came from.
 */
function SourceList({
	sources,
	onSource,
}: {
	sources: MemorySource[];
	onSource: (target: MemoryTarget | null, meetingId?: string, title?: string) => void;
}) {
	const { t } = useTranslation();
	return (
		<ul className="memory-sources">
			{sources.map((source) => {
				const Icon = SOURCE_ICONS[source.kind];
				const content = (
					<>
						<i>
							<Icon aria-hidden />
						</i>
						<span>{source.title || t(SOURCE_LABELS[source.kind])}</span>
						{source.kind === "chat" ? <small>{t("memory.sourceMessages", { count: source.count })}</small> : null}
					</>
				);
				// A source has no id of its own: its kind, title and where it goes name it.
				const key = `${source.kind}|${source.title}|${source.meetingId ?? JSON.stringify(source.target)}`;
				const target = source.target;
				return (
					<li key={key}>
						{target || source.meetingId ? (
							<button
								type="button"
								className="memory-source"
								onClick={() => onSource(target, source.meetingId, source.title)}
							>
								{content}
							</button>
						) : (
							<div className="memory-source">{content}</div>
						)}
					</li>
				);
			})}
		</ul>
	);
}

/** A quiet delete at the foot of the drawer; the second tap within four seconds does it. */
function DeleteEntry({ id, actions }: { id: string; actions: EntryActions }) {
	const { t } = useTranslation();
	const [armed, setArmed] = useState(false);
	const errorText = useErrorText();
	useEffect(() => {
		if (!armed) return;
		const timer = window.setTimeout(() => setArmed(false), 4000);
		return () => window.clearTimeout(timer);
	}, [armed]);
	const error = actions.deleteError?.id === id ? actions.deleteError.error : null;
	return (
		<div className="memory-delete">
			<Button
				size="sm"
				variant="link"
				loading={actions.deleting === id}
				className={armed ? "memory-delete-armed" : undefined}
				onClick={() => {
					if (!armed) {
						setArmed(true);
						return;
					}
					setArmed(false);
					actions.onDelete(id);
				}}
			>
				{armed ? t("memory.deleteConfirm") : t("memory.delete")}
			</Button>
			{error ? (
				<p role="alert" className="memory-error-line">
					{errorText(error)}
				</p>
			) : null}
		</div>
	);
}
