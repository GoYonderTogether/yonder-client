import { Button as NativeButton, Text, View } from "@tarojs/components";
import type { MemoryBlock, MemoryDay, MemoryDayPage, MemoryEntry, MemoryVisibility } from "@yonder/protocol";
import { useEffect, useRef, useState } from "react";
import { Button, Page, State } from "../../components/ui";
import { useResource } from "../../components/use-resource";
import { t, useLocale } from "../../lib/i18n";
import { metadataKey, readSnapshot, timelinePageAffected } from "../../lib/metadata-cache";
import { api, invalidateImages, subscribeEvents, useRealtimeRevision, useSession } from "../../lib/runtime";
import { MessageAttachment } from "../chat/attachment";
import { MessageBody } from "../chat/markdown";
import { affectsMemory } from "./realtime";
import "./style.scss";

export default function Memory() {
	const { me } = useSession();
	useLocale();
	return <Page title={t("记忆", "Memory")}>{me ? <MemorySections key={me.member.id} /> : null}</Page>;
}

function MemorySections() {
	const [section, setSection] = useState<"timeline" | "about">("timeline");
	return (
		<>
			<View className="mini-memory-segments" ariaRole="tablist" ariaLabel={t("记忆", "Memory")}>
				{(["timeline", "about"] as const).map((value) => (
					<NativeButton
						key={value}
						className={`mini-memory-tab${value === section ? " mini-memory-tab-selected" : ""}`}
						ariaRole="tab"
						ariaSelected={value === section}
						onClick={() => setSection(value)}
					>
						{value === "timeline" ? t("时间线", "Timeline") : t("了解", "About")}
					</NativeButton>
				))}
			</View>
			{section === "timeline" ? (
				<Timeline />
			) : (
				<>
					<MemoryFile path="/me/impression.md" label={t("印象", "Impression")} />
					<MemoryFile path="/me/recent.md" label={t("近期", "Recent")} />
				</>
			)}
		</>
	);
}

function useMemoryResource<T>(
	load: () => Promise<T>,
	{
		path,
		cursor,
		timeZone,
		reconcile,
	}: {
		path?: string;
		cursor?: string | undefined;
		timeZone?: string | undefined;
		reconcile?: (before: T, after: T) => void;
	},
) {
	const { memberId } = useSession();
	const key = memberId
		? path
			? metadataKey(memberId, "memory", path)
			: metadataKey(memberId, "timeline", timeZone, cursor)
		: undefined;
	const resource = useResource(load, key, reconcile);
	const { reload } = resource;
	const revision = useRealtimeRevision();
	const seenRevision = useRef(revision);
	useEffect(() => {
		if (seenRevision.current === revision) return;
		seenRevision.current = revision;
		void reload();
	}, [reload, revision]);
	useEffect(
		() =>
			subscribeEvents((event) => {
				if (!affectsMemory(event, path)) return;
				if (cursor && key && event.type === "memory.changed" && event.dates) {
					const current = readSnapshot<MemoryDayPage>(key);
					if (current && !timelinePageAffected(current.data, event.dates, false)) return;
				}
				void reload();
			}),
		[cursor, key, path, reload],
	);
	return resource;
}

function Visibility({ value }: { value?: MemoryVisibility | undefined }) {
	const labels = { private: t("私人", "Private"), public: t("公开", "Public"), secret: t("机密", "Secret") };
	return value && labels[value] ? (
		<View className="mini-memory-visibility">
			<View className={`mini-memory-visibility-icon mini-memory-${value}`} ariaHidden />
			<Text>{labels[value]}</Text>
		</View>
	) : null;
}

function MemoryFile({ path, label }: { path: string; label: string }) {
	const { data, loading, error, reload } = useMemoryResource(() => api.memoryFile(path), { path });
	return (
		<View className="mini-card">
			<View className="mini-memory-heading">
				<Text className="mini-memory-title">{label}</Text>
				<Visibility value={error ? undefined : data?.visibility} />
			</View>
			{data ? (
				<MessageBody body={data.content} />
			) : (
				<State loading={loading} error={error} retry={() => void reload()} />
			)}
		</View>
	);
}

function Timeline() {
	const [cursors, setCursors] = useState<string[]>([]);
	const cursor = cursors.at(-1);
	return (
		<TimelinePage
			key={cursor ?? ""}
			cursor={cursor}
			onNewer={cursor ? () => setCursors(cursors.slice(0, -1)) : undefined}
			onOlder={(next) => setCursors([...cursors, next])}
		/>
	);
}

function deviceTimeZone(): string | undefined {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
	} catch {
		return undefined;
	}
}

function TimelinePage({
	cursor,
	onNewer,
	onOlder,
}: {
	cursor: string | undefined;
	onNewer: (() => void) | undefined;
	onOlder: (cursor: string) => void;
}) {
	const timeZone = deviceTimeZone();
	const { data, loading, error, reload } = useMemoryResource(() => api.memoryDays(cursor, timeZone), {
		cursor,
		timeZone,
		reconcile: reconcileTimelineImages,
	});
	const [now, setNow] = useState(() => new Date());
	const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString();
	const today = local.slice(0, 10);
	const previousDay = useRef(today);
	useEffect(() => {
		if (cursor) return;
		let timer: ReturnType<typeof setTimeout>;
		const tick = () => {
			const current = new Date();
			setNow(current);
			timer = setTimeout(tick, 60_000 - (current.getTime() % 60_000));
		};
		tick();
		return () => clearTimeout(timer);
	}, [cursor]);
	useEffect(() => {
		if (previousDay.current === today) return;
		previousDay.current = today;
		void reload();
	}, [today, reload]);

	const items = data?.items ?? [];
	const current: MemoryDay = items.find((day) => day.date === today) ?? {
		date: today,
		state: "ready",
		failure: null,
		digest: { steps: null, places: 0, photos: 0 },
		digestPath: null,
		blocks: [],
	};
	const history = items.flatMap((day) => {
		if (day.date === today) return [];
		// The server only projects scheduled tasks for today. Drop cached ones at midnight.
		const blocks = day.blocks.filter(
			(block) => block.type !== "entry" || block.entry.deletable || !block.entry.id.startsWith("plan-"),
		);
		return blocks.length || day.state !== "ready" ? [{ ...day, blocks }] : [];
	});
	const days = cursor ? history : [current, ...history];
	const nextCursor = data?.nextCursor;
	return (
		<>
			{error || (!days.length && !loading) || (loading && !data) ? (
				<State loading={loading} error={error} retry={() => void reload()} empty={t("还没有记忆", "No memories yet")} />
			) : null}
			{days.map((day) => {
				const isToday = day.date === today;
				return (
					<View key={day.date}>
						<Text className="mini-subtitle">
							{isToday ? t(`今天 ${now.getMonth() + 1}月${now.getDate()}日`, `Today ${today}`) : day.date}
						</Text>
						{isToday ? (
							<Text className="mini-muted">{t(`现在 ${local.slice(11, 16)}`, `Now ${local.slice(11, 16)}`)}</Text>
						) : null}
						{day.failure ? <Text className="mini-error">{day.failure}</Text> : null}
						{day.state === "organizing" ? <Text className="mini-muted">{t("正在整理…", "Organizing…")}</Text> : null}
						{day.blocks
							.slice()
							.reverse()
							.map((block) => (
								<TimelineBlock
									key={block.type === "entry" ? block.entry.id : block.stay.id}
									block={block}
									now={isToday ? now.getTime() : undefined}
								/>
							))}
					</View>
				);
			})}
			{onNewer || nextCursor ? (
				<View className="actions">
					{onNewer ? (
						<Button secondary onClick={onNewer}>
							{t("较新的记忆", "Newer memories")}
						</Button>
					) : null}
					{nextCursor ? (
						<Button secondary onClick={() => onOlder(nextCursor)}>
							{t("更早的记忆", "Older memories")}
						</Button>
					) : null}
				</View>
			) : null}
		</>
	);
}

function timelineImages(page: MemoryDayPage) {
	return page.items.flatMap((day) =>
		day.blocks
			.flatMap((block) => (block.type === "entry" ? [block.entry] : block.stay.entries))
			.flatMap((entry) => entry.media.map(({ attachment }) => attachment.id)),
	);
}

function reconcileTimelineImages(before: MemoryDayPage, after: MemoryDayPage) {
	const current = new Set(timelineImages(after));
	const days = before.items.filter((day) => timelinePageAffected(after, [day.date], false));
	invalidateImages(timelineImages({ ...before, items: days }).filter((id) => !current.has(id)));
}

function TimelineBlock({ block, now }: { block: MemoryBlock; now: number | undefined }) {
	if (block.type === "entry") return <TimelineCard entry={block.entry} now={now} />;
	return (
		<View>
			<Text className="mini-muted">{block.stay.place}</Text>
			{block.stay.entries
				.slice()
				.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
				.map((entry) => (
					<TimelineCard key={entry.id} entry={entry} now={now} />
				))}
		</View>
	);
}

function TimelineCard({ entry, now }: { entry: MemoryEntry; now: number | undefined }) {
	const content = entry.body || entry.text;
	const upcoming = now !== undefined && Date.parse(entry.at) > now;
	const sourceLabels = {
		chat: t("对话", "Conversation"),
		meeting: t("录音笔记", "Recording notes"),
		task: t("任务", "Task"),
	};
	const sources = entry.sources.map((source) => source.title || sourceLabels[source.kind]);
	return (
		<View className="mini-card">
			<View className="mini-memory-heading">
				<Text className="mini-memory-title">{entry.title}</Text>
				<Visibility value={entry.visibility} />
			</View>
			{upcoming ? <Text className="mini-muted">{t("计划", "Planned")}</Text> : null}
			{content ? <MessageBody body={content} /> : null}
			{entry.media
				.filter(({ attachment }) => attachment.kind === "image")
				.slice(0, 4)
				.map(({ attachment }) => (
					<MessageAttachment key={attachment.id} file={attachment} timeline />
				))}
			{sources.length ? <Text className="mini-muted">{sources.join(t("、", ", "))}</Text> : null}
		</View>
	);
}
