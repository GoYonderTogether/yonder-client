import type { MemoryEntry, MemoryFileSummary } from "@yonder/protocol";
import { ListGroup, ListRow } from "@yonder/ui-components";
import { useMemoryDays, useMemoryFiles } from "@yonder/ui-data";
import { CalendarRange, FolderOpen, Globe, History, NotebookPen } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { dayName, daysAgo, memoryFormat, useMinute } from "./memory-format.ts";
import { MemoryIdCard } from "./memory-id-card.tsx";
import { MemoryError, MemoryLoading } from "./memory-status.tsx";
import { fileGroup, memoryGroupRoute } from "./memory-view.ts";

const RECENT = 5;
const ORDER = ["notes", "sources", "digests", "public"];

export interface MemoryGroupSummary {
	group: string;
	files: number;
	drafts: number;
}

/** Groups in the order of 24 第五节, connectors by name; the card's two `/me` files are in no group. */
export function summarizeGroups(files: readonly MemoryFileSummary[]): MemoryGroupSummary[] {
	const groups = new Map<string, MemoryGroupSummary>();
	for (const file of files) {
		const group = fileGroup(file.path);
		if (!group) continue;
		const current = groups.get(group) ?? { group, files: 0, drafts: 0 };
		current.files += 1;
		if (file.draft) current.drafts += 1;
		groups.set(group, current);
	}
	const rank = (group: string) => ORDER.indexOf(group.split(":")[0] ?? group);
	return [...groups.values()].sort((a, b) => rank(a.group) - rank(b.group) || a.group.localeCompare(b.group));
}

export function useGroupName() {
	const { t } = useTranslation();
	return (group: string) =>
		group.startsWith("sources:")
			? group.slice("sources:".length)
			: t(
					group === "notes"
						? "memory.notesFolder"
						: group === "digests"
							? "memory.digestsFolder"
							: "memory.publicFolder",
				);
}

export function GroupIcon({ group, size = 18 }: { group: string; size?: number }) {
	const Icon =
		group === "notes" ? NotebookPen : group === "digests" ? CalendarRange : group === "public" ? Globe : FolderOpen;
	return <Icon size={size} aria-hidden="true" />;
}

/** The newest entries that have happened, newest first, each with the day it belongs to. */
function recentEntries(days: { date: string; blocks: { type: string }[] }[], now: Date) {
	const out: { date: string; entry: MemoryEntry }[] = [];
	for (const day of days) {
		if (daysAgo(day.date, now) < 0) continue;
		const entries = (
			day.blocks as ({ type: "entry"; entry: MemoryEntry } | { type: "stay"; stay: { entries: MemoryEntry[] } })[]
		)
			.flatMap((block) => (block.type === "entry" ? [block.entry] : block.stay.entries))
			.filter((entry) => new Date(entry.at) <= now)
			.sort((a, b) => b.at.localeCompare(a.at));
		for (const entry of entries) {
			if (out.length >= RECENT) return out;
			out.push({ date: day.date, entry });
		}
	}
	return out;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-[var(--spacing-3)]">
			<h2 className="border-b border-[var(--color-border)] px-[var(--spacing-1)] pb-[var(--spacing-2)] text-h3 font-semibold text-[var(--color-text-primary)]">
				{title}
			</h2>
			{children}
		</section>
	);
}

function Recent() {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const now = useMinute();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const query = useMemoryDays();
	if (query.isError && !query.data)
		return <MemoryError title={t("memory.loadFailed")} error={query.error} retry={() => void query.refetch()} />;
	if (query.isPending) return <MemoryLoading />;
	const recent = recentEntries(
		query.data.pages.flatMap((page) => page.items),
		now,
	);
	const open = () => navigate("/memory/timeline");
	return (
		<ul className="overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-bg-surface)]">
			{recent.length ? (
				recent.map(({ date, entry }, index) => (
					<li key={entry.id} className="border-b border-dashed border-[var(--color-border)]">
						{recent[index - 1]?.date !== date ? (
							<p className="px-[var(--spacing-4)] pt-[var(--spacing-3)] text-caption text-[var(--color-text-tertiary)]">
								{dayName(date, now, t, locale).name}
							</p>
						) : null}
						<button
							type="button"
							onClick={open}
							className="flex w-full items-center gap-[var(--spacing-3)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-start hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
						>
							<time
								dateTime={entry.at}
								className="w-[3em] shrink-0 text-caption tabular-nums text-[var(--color-text-tertiary)]"
							>
								{memoryFormat.time(entry.at, locale)}
							</time>
							<span className="min-w-0 flex-1 truncate text-body text-[var(--color-text-primary)]">{entry.title}</span>
						</button>
					</li>
				))
			) : (
				<li className="border-b border-dashed border-[var(--color-border)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-body text-[var(--color-text-tertiary)]">
					{t("memory.timelineEmpty")}
				</li>
			)}
			<li>
				<button
					type="button"
					onClick={open}
					className="flex w-full items-center px-[var(--spacing-4)] py-[var(--spacing-3)] text-start text-body text-[var(--color-accent-text)] hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
				>
					{t("memory.viewTimeline")}
				</button>
			</li>
		</ul>
	);
}

function useGroups() {
	const query = useMemoryFiles();
	return { query, groups: query.data ? summarizeGroups(query.data.items) : [] };
}

function GroupMeta({ summary }: { summary: MemoryGroupSummary }) {
	const { t } = useTranslation();
	return (
		<>
			{t("memory.fileCount", { count: summary.files })}
			{summary.drafts ? (
				<span className="text-[var(--color-warning)]">
					{" · "}
					{t("memory.pendingCount", { count: summary.drafts })}
				</span>
			) : null}
		</>
	);
}

function Tiles() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const name = useGroupName();
	const { query, groups } = useGroups();
	if (query.error) return <MemoryError error={query.error} retry={() => void query.refetch()} />;
	if (query.isPending) return <MemoryLoading />;
	if (!groups.length)
		return (
			<p className="rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] px-[var(--spacing-4)] py-[var(--spacing-4)] text-body text-[var(--color-text-tertiary)]">
				{t("memory.noFiles")}
			</p>
		);
	return (
		<div className="grid grid-cols-2 gap-[var(--spacing-3)] min-[640px]:grid-cols-3">
			{groups.map((summary) => (
				<button
					key={summary.group}
					type="button"
					onClick={() => navigate(memoryGroupRoute(summary.group))}
					className="flex min-h-[calc(var(--spacing-16)+var(--spacing-8))] flex-col justify-between gap-[var(--spacing-4)] rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] p-[var(--spacing-4)] text-start transition-colors hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
				>
					<span className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent-subtle)] text-[var(--color-accent-text)]">
						<GroupIcon group={summary.group} />
					</span>
					<span className="flex min-w-0 flex-col">
						<span className="truncate text-body font-semibold text-[var(--color-text-primary)]">
							{name(summary.group)}
						</span>
						<span className="truncate text-caption text-[var(--color-text-tertiary)]">
							<GroupMeta summary={summary} />
						</span>
					</span>
				</button>
			))}
		</div>
	);
}

/** Phone and narrow desktop: the card, the latest of the timeline, then every group as a card. */
export function MemoryHome() {
	const { t } = useTranslation();
	return (
		<div className="mx-auto flex w-full max-w-[600px] flex-col gap-[var(--spacing-8)] py-[var(--spacing-2)]">
			<MemoryIdCard />
			<Section title={t("memory.recentTitle")}>
				<Recent />
			</Section>
			<Section title={t("memory.allTitle")}>
				<Tiles />
			</Section>
		</div>
	);
}

/**
 * Wide desktop's list column: the card, then 「全部」 as a list whose first row is the timeline,
 * so the white page beside it always shows the selected one.
 */
export function MemoryColumn({ selected }: { selected: string }) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const name = useGroupName();
	const { query, groups } = useGroups();
	return (
		<div className="flex flex-col gap-[var(--spacing-6)] px-[var(--spacing-2)] py-[var(--spacing-2)]">
			<MemoryIdCard compact />
			<ListGroup variant="card" title={t("memory.allTitle")}>
				<ListRow
					leading={<History size={18} aria-hidden="true" />}
					title={t("memory.timeline")}
					selected={selected === "timeline"}
					onClick={() => navigate("/memory/timeline")}
				/>
				{groups.map((summary) => (
					<ListRow
						key={summary.group}
						leading={<GroupIcon group={summary.group} />}
						title={name(summary.group)}
						trailing={<GroupMeta summary={summary} />}
						selected={selected === summary.group}
						onClick={() => navigate(memoryGroupRoute(summary.group))}
					/>
				))}
			</ListGroup>
			{query.error ? <MemoryError error={query.error} retry={() => void query.refetch()} /> : null}
		</div>
	);
}
