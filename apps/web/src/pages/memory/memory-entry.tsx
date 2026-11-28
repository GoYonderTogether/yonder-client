import type { MemoryEntry as Entry } from "@yonder/protocol";
import { Avatar, cn } from "@yonder/ui-components";
import { Clock, Images, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EntryActions } from "./memory-actions.ts";
import { EntryDrawer, SOURCE_LABELS } from "./memory-drawer.tsx";
import { entryIcon, KIND_ICONS, memoryFormat } from "./memory-format.ts";
import { MemoryThumb } from "./memory-media.tsx";
import { VisibilityMark } from "./memory-visibility.tsx";

/** The node on the spine: its size says how much the entry matters, colour and icon say what it is. */
export function MemoryNode({ entry }: { entry: Entry }) {
	const Icon = entryIcon(entry);
	return (
		<span className="memory-node" aria-hidden>
			<i>
				<Icon />
			</i>
		</span>
	);
}

/**
 * One entry, at the size the server chose. Tapping it opens what it holds in place, like an
 * accordion; opening another closes this one.
 */
export function MemoryEntry({ entry, upcoming, actions }: { entry: Entry; upcoming: boolean; actions: EntryActions }) {
	const { t, i18n } = useTranslation();
	const open = actions.open === entry.id;
	const hasMore = Boolean(
		entry.media.length ||
			entry.materials.length ||
			entry.quote ||
			entry.links.length ||
			entry.body ||
			entry.sources.length ||
			entry.deletable ||
			(entry.text && entry.size !== "note"),
	);
	const time = <time dateTime={entry.at}>{memoryFormat.time(entry.at, i18n.language)}</time>;
	const kinds = [...new Set(entry.sources.map((source) => t(SOURCE_LABELS[source.kind])))];
	const sources = kinds.length ? t("memory.fromSources", { sources: kinds.join(" / ") }) : "";
	const marked = entry.visibility === "public" || entry.visibility === "secret";
	const body = (
		<>
			<EntryBody entry={entry} time={time} />
			{marked || sources ? (
				<span className="flex min-w-0 flex-wrap items-center gap-x-[var(--spacing-3)] gap-y-[var(--spacing-1)]">
					<VisibilityMark visibility={entry.visibility} />
					{sources ? (
						<span className="min-w-0 truncate text-caption text-[var(--color-text-secondary)]">{sources}</span>
					) : null}
				</span>
			) : null}
		</>
	);
	return (
		<li
			id={`memory-entry-${entry.id}`}
			className={cn(
				"memory-entry",
				`memory-size-${entry.size}`,
				`memory-kind-${entry.kind}`,
				upcoming && "memory-upcoming",
				open && "memory-open",
				actions.flash === entry.id && "memory-flash",
			)}
		>
			<MemoryNode entry={entry} />
			{hasMore ? (
				<button
					type="button"
					className="memory-hit"
					aria-expanded={open}
					aria-controls={`memory-drawer-${entry.id}`}
					onClick={() => actions.onToggle(entry.id)}
				>
					{body}
				</button>
			) : (
				<div className="memory-hit">{body}</div>
			)}
			{hasMore ? (
				<div className="memory-drawer" id={`memory-drawer-${entry.id}`} inert={!open}>
					<div>{open ? <EntryDrawer entry={entry} actions={actions} /> : null}</div>
				</div>
			) : null}
		</li>
	);
}

function EntryBody({ entry, time }: { entry: Entry; time: React.ReactNode }) {
	const { t, i18n } = useTranslation();
	const shown = entry.media.slice(0, 4);
	const extra = Math.max(0, entry.mediaCount - shown.length);
	if (entry.size === "line") {
		const first = entry.materials[0];
		const link = entry.mediaCount
			? { kind: "photo" as const, icon: Images, label: t("memory.photoCount", { count: entry.mediaCount }) }
			: first
				? { kind: first.kind, icon: KIND_ICONS[first.kind], label: first.label }
				: null;
		return (
			<span className="memory-row">
				<span className="memory-title">
					{entry.title}
					{link ? (
						<span className={cn("memory-link", `memory-kind-${link.kind}`)}>
							<link.icon aria-hidden />
							{link.label}
						</span>
					) : null}
				</span>
				{time}
			</span>
		);
	}
	if (entry.size === "moment") {
		return (
			<>
				{shown.length ? (
					<span className={cn("memory-mosaic", shown.length > 3 && "memory-mosaic-4")}>
						{shown.map((media, index) => (
							<MemoryThumb
								key={media.attachment.id}
								media={media}
								more={index === shown.length - 1 ? extra : 0}
								persistent={entry.visibility !== "secret"}
							/>
						))}
					</span>
				) : null}
				<span className="memory-row">
					<span className="memory-title">{entry.title}</span>
				</span>
				<span className="memory-facts">
					{entry.place ? (
						<span className="memory-fact-place">
							<MapPin aria-hidden />
							{entry.place}
						</span>
					) : null}
					<span>
						<Clock aria-hidden />
						{entry.endsAt
							? t("memory.span", {
									from: memoryFormat.time(entry.at, i18n.language),
									to: memoryFormat.time(entry.endsAt, i18n.language),
								})
							: memoryFormat.time(entry.at, i18n.language)}
					</span>
					{entry.mediaCount ? (
						<span>
							<Images aria-hidden />
							{t("memory.photoCount", { count: entry.mediaCount })}
						</span>
					) : null}
				</span>
				{entry.people.length ? (
					<span className="memory-people">
						{entry.people.slice(0, 5).map((person) => (
							<Avatar key={person.name} name={person.name} src={person.avatarUrl} size={24} />
						))}
						<span>{t("memory.people", { count: entry.people.length })}</span>
					</span>
				) : null}
			</>
		);
	}
	return (
		<>
			<span className="memory-row">
				<span className="memory-title">{entry.title}</span>
				{time}
			</span>
			{entry.size === "note" && entry.text ? <span className="memory-text">{entry.text}</span> : null}
			{entry.size === "media" && shown.length ? (
				<span className="memory-thumbs">
					{shown.map((media, index) => (
						<MemoryThumb
							key={media.attachment.id}
							media={media}
							more={index === shown.length - 1 ? extra : 0}
							persistent={entry.visibility !== "secret"}
						/>
					))}
				</span>
			) : null}
			{entry.size === "note" && (entry.materials.length || entry.tags.length) ? (
				<span className="memory-chips">
					{entry.materials.slice(0, 3).map((material) => {
						const Icon = KIND_ICONS[material.kind];
						return (
							<span key={material.id} className={cn("memory-chip", `memory-kind-${material.kind}`)}>
								<Icon aria-hidden />
								<span>{material.label}</span>
							</span>
						);
					})}
					{entry.tags.map((tag) => (
						<span key={tag} className="memory-tag">
							#{tag}
						</span>
					))}
				</span>
			) : null}
		</>
	);
}
