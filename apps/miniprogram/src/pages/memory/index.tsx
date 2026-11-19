import { Button as NativeButton, Text, View } from "@tarojs/components";
import type { MemoryEntry, MemoryVisibility } from "@yonder/protocol";
import { useEffect, useRef, useState } from "react";
import { Button, Page, State } from "../../components/ui";
import { useResource } from "../../components/use-resource";
import { t, useLocale } from "../../lib/i18n";
import { api, subscribeEvents, useRealtimeRevision, useSession } from "../../lib/runtime";
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
					<MemoryFile path="/me/印象.md" label={t("印象", "Impression")} />
					<MemoryFile path="/me/近期.md" label={t("近期", "Recent")} />
				</>
			)}
		</>
	);
}

function useMemoryResource<T>(load: () => Promise<T>, path?: string) {
	const resource = useResource(load);
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
				if (affectsMemory(event, path)) void reload();
			}),
		[path, reload],
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
	const { data, loading, error, reload } = useMemoryResource(() => api.memoryFile(path), path);
	return (
		<View className="mini-card">
			<View className="mini-memory-heading">
				<Text className="mini-memory-title">{label}</Text>
				<Visibility value={error ? undefined : data?.visibility} />
			</View>
			{data && !error ? (
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
	const { data, loading, error, reload } = useMemoryResource(() => api.memoryDays(cursor, deviceTimeZone()));
	const days = data?.items.filter((day) => day.blocks.length > 0 || day.state !== "ready") ?? [];
	const nextCursor = data?.nextCursor;
	return (
		<>
			{error || (!days.length && !loading) || (loading && !data) ? (
				<State loading={loading} error={error} retry={() => void reload()} empty={t("还没有记忆", "No memories yet")} />
			) : null}
			{!error &&
				days.map((day) => (
					<View key={day.date}>
						<Text className="mini-subtitle">{day.date}</Text>
						{day.failure ? <Text className="mini-error">{day.failure}</Text> : null}
						{day.state === "organizing" ? <Text className="mini-muted">{t("正在整理…", "Organizing…")}</Text> : null}
						{day.blocks.map((block) =>
							block.type === "entry" ? (
								<TimelineCard key={block.entry.id} entry={block.entry} />
							) : (
								<View key={block.stay.id}>
									<Text className="mini-muted">{block.stay.place}</Text>
									{block.stay.entries.map((entry) => (
										<TimelineCard key={entry.id} entry={entry} />
									))}
								</View>
							),
						)}
					</View>
				))}
			{onNewer || (nextCursor && !error) ? (
				<View className="actions">
					{onNewer ? (
						<Button secondary onClick={onNewer}>
							{t("较新的记忆", "Newer memories")}
						</Button>
					) : null}
					{nextCursor && !error ? (
						<Button secondary onClick={() => onOlder(nextCursor)}>
							{t("更早的记忆", "Older memories")}
						</Button>
					) : null}
				</View>
			) : null}
		</>
	);
}

function TimelineCard({ entry }: { entry: MemoryEntry }) {
	const content = entry.body || entry.text;
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
			{content ? <MessageBody body={content} /> : null}
			{sources.length ? <Text className="mini-muted">{sources.join(t("、", ", "))}</Text> : null}
		</View>
	);
}
