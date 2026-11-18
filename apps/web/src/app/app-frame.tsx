import { PasswordSetupForm } from "@yonder/feature-auth";
import { isMeSection, MeList, MeSectionPage } from "@yonder/feature-me";
import { MeetingRecorderCapsule } from "@yonder/feature-meetings";
import { BotList, ClosedGroupNotice, PrivacySwitches } from "@yonder/feature-members";
import { AppIcon, Avatar } from "@yonder/ui-components";
import {
	keys,
	useBot,
	useCompactConversation,
	useContacts,
	useConversations,
	useData,
	useDataQueryClient,
	useHealth,
	useMessages,
	usePerson,
	useRunActions,
	useSendMessage,
	useSkills,
} from "@yonder/ui-data";
import type { LayoutMode, TabId } from "@yonder/ui-shell";
import { AppShell, locate, MAIN_CONVERSATION, tabPath } from "@yonder/ui-shell";
import type { ReactNode } from "react";
import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { BUILD_VERSION } from "../lib/config.ts";
import { listenForContactAdded } from "../lib/contact-window.ts";
import { useLocalFilesAdapter } from "../lib/local-files.ts";
import { isDesktopExperience, isMacDesktopShell } from "../lib/platform.ts";
import { conversationTitle, primaryConversation, selectedConversation } from "../pages/conversation-presentation.tsx";
import { FlyToComposer } from "../pages/items-fly.tsx";
import { MessageContent } from "../pages/message-content.tsx";
import { ConversationPage, MessagesList } from "../pages/messages-page.tsx";
import { NotFoundPage } from "../pages/not-found-page.tsx";
import { UpdateControls } from "../updates/controls.tsx";
import { ChunkBoundary } from "./chunk-boundary.tsx";
import { CompactStatus } from "./completion/compact-status.tsx";
import { completionItems } from "./completion/items.ts";
import { Composer } from "./composer.tsx";
import { FileDropZone } from "./file-drop-zone.tsx";
import { FrameOverlays, useFrameLayers } from "./frame-overlays.tsx";
import { useChatDraft } from "./use-chat-draft.ts";
import { useHasPassword } from "./use-has-password.ts";
import { useMeEntry } from "./use-me-entry.ts";
import { useMeetingCloud } from "./use-meeting-cloud.ts";
import { useMeetingRecorder } from "./use-meeting-recorder.ts";
import { useModelDirtyGuard } from "./use-model-dirty-guard.ts";
import { usePageNavigation } from "./use-page-navigation.ts";
import { useTaskPreset } from "./use-task-preset.ts";

const MemoryList = lazy(() => import("../pages/memory-page.tsx").then((module) => ({ default: module.MemoryList })));
const MemoryPage = lazy(() => import("../pages/memory-page.tsx").then((module) => ({ default: module.MemoryPage })));
const TasksList = lazy(() => import("../pages/tasks-page.tsx").then((module) => ({ default: module.TasksList })));
const TaskPage = lazy(() => import("../pages/tasks-page.tsx").then((module) => ({ default: module.TaskPage })));

/** Assembles the active list and detail; the shell owns their responsive layout. */
export function AppFrame() {
	const localFiles = useLocalFilesAdapter();
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const person = usePerson();
	const bot = useBot();
	const recorder = useMeetingRecorder(person?.id ?? null);
	const [recorderOpen, setRecorderOpen] = useState(false);
	const [shortVoiceActive, setShortVoiceActive] = useState(false);
	const activeRecording = recorder.state.recordings.find((recording) => recording.id === recorder.state.activeId);
	const { realtime, storage } = useData();
	const connectionStatus = useSyncExternalStore(
		realtime.subscribe,
		() => realtime.status,
		() => "idle",
	);
	const disconnected = connectionStatus === "reconnecting";
	const conversations = useConversations();
	const health = useHealth();
	const hasPassword = useHasPassword();
	const skills = useSkills();
	const contacts = useContacts();
	const [layoutMode, setLayoutMode] = useState<LayoutMode | null>(null);
	const modelDirty = useModelDirtyGuard();
	const previousLocation = useRef("/messages");

	const located = locate(location.pathname);
	const meOpen = located !== null && located.tab === null;
	const path = `${location.pathname}${location.search}${location.hash}`;
	useEffect(() => {
		if (located?.tab) previousLocation.current = path;
	}, [located?.tab, path]);
	const remembered = (location.state as { tabLocation?: string } | null)?.tabLocation;
	const tabLocation = meOpen ? remembered || previousLocation.current : path;
	const base = meOpen ? locate(tabLocation.split(/[?#]/)[0] ?? "/messages") : located;
	const tab = base?.tab ?? "messages";
	const [selection = null] = base?.detail ?? [];
	const [first = null, second = null] = meOpen ? located.detail : [];
	const section = first && isMeSection(first) ? first : null;
	const meEntry = useMeEntry(storage, person?.id, section);
	const splitMe = isDesktopExperience() && layoutMode === "wide";
	useEffect(() => {
		if (splitMe && meOpen && !first && person) {
			navigate(meEntry, { replace: true, state: location.state });
		}
	}, [splitMe, meOpen, first, person, meEntry, navigate, location.state]);
	const navigation = usePageNavigation(tabLocation);
	const queryClient = useDataQueryClient();
	const contactAdded = useEffectEvent((id: string) => {
		void queryClient.invalidateQueries({ queryKey: keys.conversations.list() });
		void queryClient.invalidateQueries({ queryKey: keys.contacts() });
		navigation.open(`/messages/${encodeURIComponent(id)}`);
	});
	useEffect(() => {
		let disposed = false;
		let cleanup: (() => void) | undefined;
		void listenForContactAdded((id) => contactAdded(id)).then((unlisten) => {
			if (disposed) unlisten();
			else cleanup = unlisten;
		});
		return () => {
			disposed = true;
			cleanup?.();
		};
	}, []);
	const messageSelection = tab === "messages" ? selection : null;
	const conversation = selectedConversation(conversations.data?.items, messageSelection, bot?.id);
	const recordingTarget = conversation?.members.some((member) => member.memberId === bot?.id)
		? conversation
		: primaryConversation(conversations.data?.items, bot?.id);
	const meetingCloud = useMeetingCloud(
		person?.id ?? null,
		recorder,
		recordingTarget && bot ? { id: recordingTarget.id, name: bot.displayName } : null,
		recorderOpen,
	);
	const draft = useChatDraft(person?.id, conversation?.id);
	const history = useMessages(conversation?.id ?? null);
	const send = useSendMessage(conversation?.id ?? null, person?.id);
	const compact = useCompactConversation(conversation?.id);
	const actions = useRunActions();
	const layers = useFrameLayers();
	const openMember = useEffectEvent((memberId: string) => {
		const member = contacts.data?.items.find((item) => item.id === memberId);
		const listed = conversation?.members.find((item) => item.memberId === memberId);
		const handle = member?.handle ?? listed?.handle;
		if (member?.kind === "bot" && member.ownerId === person?.id) layers.setBotDetail(member.id);
		else if (handle) layers.setMemberCard(handle);
	});
	/**
	 * A deleted Bot's chat leaves the list over the socket; if it is the one on screen, the frame
	 * goes back to the message list rather than showing an empty page (17 3.1).
	 */
	const removedConversation = useEffectEvent((conversationId: string) => {
		layers.setBotDetail(null);
		const open = locate(navigation.current());
		if (open?.tab !== "messages") return;
		if ([...open.detail].includes(conversationId)) navigation.back("/messages");
	});
	useEffect(
		() =>
			realtime.subscribeEvents((event) => {
				if (event.type === "conversation.removed") removedConversation(event.conversationId);
			}),
		[realtime],
	);
	const streaming = history.data?.pages
		.flatMap((page) => page.items)
		.findLast((message) => message.senderKind === "bot" && message.streaming);
	const preset = useTaskPreset({
		person,
		bot,
		conversation,
		conversations: conversations.data?.items,
		draft,
		open: navigation.open,
	});
	const segmentRoot = (tab === "tasks" && selection === "scheduled") || (tab === "memory" && selection === "files");
	const detailOpen = selection !== null && !segmentRoot;
	/**
	 * Back, Escape and a swipe are one exit, and a layer that is animating out still holds the props
	 * it had when the route left it. The exit therefore reads the route the frame is on now, not the
	 * captured render: two quick Escapes must step back twice, not ask the screen that is already
	 * leaving to leave again.
	 */
	const currentBack = () => {
		const live = locate(navigation.current());
		const liveMeOpen = live !== null && live.tab === null;
		const [liveFirst = null, liveSecond = null] = liveMeOpen ? live.detail : [];
		if (!liveMeOpen) return navigation.back(tabPath(live?.tab ?? tab));
		if (liveSecond) return navigation.back(`/me/${liveFirst}`);
		if (liveFirst && !splitMe) return navigation.back("/me");
		return navigation.back(tabLocation);
	};
	const backRef = useRef(currentBack);
	backRef.current = currentBack;
	const back = useCallback(() => backRef.current(), []);

	const { list, content } = base ? screensFor() : { list: null, content: <NotFoundPage /> };
	const me = meOpen
		? {
				list: <MeList current={section} onOpen={(id) => navigation.open(`/me/${id}`)} />,
				pages: first
					? [
							{ key: `/me/${first}`, content: deferred(mePage(null)) },
							...(second ? [{ key: `/me/${first}/${second}`, content: deferred(mePage(second)) }] : []),
						]
					: [],
				onClose: () => navigation.back(tabLocation),
				closeLabel: t("app.close"),
			}
		: undefined;

	function deferred(content: ReactNode): ReactNode {
		return (
			<ChunkBoundary resetKey={path}>
				<Suspense fallback={null}>{content}</Suspense>
			</ChunkBoundary>
		);
	}

	function mePage(page: string | null): ReactNode {
		return first && !section ? (
			<NotFoundPage />
		) : (
			<MeSectionPage
				section={section}
				page={page}
				onOpenPage={(next) => (next ? navigation.open(`/me/${first}/${next}`) : navigation.back(`/me/${first}`))}
				onOpenDevices={() => navigation.open("/me/devices")}
				onAddDevice={() => navigation.open("/download?connect-device=1")}
				{...(localFiles ? { localFiles } : {})}
				onModelDirtyChange={(dirty) => {
					modelDirty.current = dirty;
				}}
				onSignedOut={() => navigate("/sign-in", { replace: true })}
				onOpenLegal={(document) => navigate(`/${document}`, { state: { backgroundLocation: location } })}
				appVersion={BUILD_VERSION}
				serverVersion={health.data?.version ?? null}
				aboutUpdate={<UpdateControls />}
				renderChangePassword={(onDone) => (
					<PasswordSetupForm mode={hasPassword ? "change" : "set"} onDone={onDone} onSkip={onDone} />
				)}
				bots={<BotList onOpen={layers.setBotDetail} />}
				privacy={<PrivacySwitches />}
			/>
		);
	}

	function screensFor(): { list: ReactNode | null; content: ReactNode } {
		switch (tab) {
			case "messages":
				return {
					list: (
						<MessagesList
							current={selection}
							onOpen={(id) => navigation.open(`/messages/${encodeURIComponent(id)}`)}
							onOpenMeetings={() => {
								setRecorderOpen(true);
								if (!selection) navigation.open(`/messages/${MAIN_CONVERSATION}`);
							}}
						/>
					),
					content: (
						<ConversationPage
							conversationId={selection ? (conversation?.id ?? null) : null}
							disconnected={disconnected}
							onOpenMeeting={(id) => {
								meetingCloud.select(id);
								setRecorderOpen(true);
							}}
							onOpenMember={openMember}
							onOpenGroup={() => layers.setGroupInfo(true)}
						/>
					),
				};
			case "tasks":
				return {
					list: (
						<TasksList
							scheduled={selection === "scheduled"}
							onChange={(value) => navigation.open(value ? "/tasks/scheduled" : "/tasks")}
							onOpenItem={(id) => navigation.open(`/tasks/${encodeURIComponent(id)}`)}
							onAdd={() => preset.addFromTasks(selection === "scheduled")}
						/>
					),
					content: (
						<TaskPage
							taskId={segmentRoot ? null : selection}
							onOpenConversation={(id) => navigation.open(`/messages/${encodeURIComponent(id)}`)}
						/>
					),
				};
			case "memory":
				return {
					list: (
						<MemoryList
							files={selection === "files"}
							onChange={(value) => navigation.open(value ? "/memory/files" : "/memory")}
						/>
					),
					content: <MemoryPage files={selection === "files"} />,
				};
		}
	}

	const talkingTo = tab === "messages" && conversation ? conversationTitle(conversation, person?.id) : undefined;
	const composer = (
		<Composer
			microphoneOccupied={Boolean(activeRecording)}
			onVoiceActivityChange={setShortVoiceActive}
			recipientName={talkingTo ?? bot?.displayName ?? null}
			draft={draft.text}
			onDraftChange={draft.setText}
			readOnly={!draft.loaded}
			files={draft.files}
			onFiles={draft.addFiles}
			onRemoveFile={draft.removeFile}
			onRetryFile={draft.retryFile}
			onOriginalFileChange={draft.toggleOriginal}
			scope={`${person?.id}:${conversation?.id}`}
			mobilePicker={!isDesktopExperience()}
			error={draft.error}
			disabled={
				!conversation ||
				!draft.loaded ||
				history.isLoading ||
				history.isError ||
				draft.sending ||
				send.isPending ||
				disconnected
			}
			disconnected={disconnected}
			sendOnEnter={isDesktopExperience()}
			streaming={Boolean(streaming)}
			completionItems={completionItems(
				conversation?.members.some((member) => member.kind === "bot") ? (skills.data?.items ?? []) : [],
				contacts.data?.items ?? [],
				conversation?.members ?? [],
				bot,
				t("skills.compact"),
			)}
			selectedSkillIds={draft.skillIds}
			bindings={draft.bindings ?? []}
			onAcceptCompletion={draft.acceptCompletion}
			onCompact={compact.run}
			commandStatus={<CompactStatus command={compact} />}
			onStop={() => {
				if (streaming) actions.stop.mutate(streaming.id);
			}}
			onSend={() => {
				if (!conversation) return;
				void draft.submit((input) => send.mutateAsync(input));
				if (tab !== "messages" || !selection) navigation.open(`/messages/${MAIN_CONVERSATION}`);
			}}
		/>
	);
	const labels: Record<TabId, string> = {
		messages: t("nav.messages"),
		tasks: t("nav.tasks"),
		memory: t("nav.memory"),
	};
	// The owner of a Bot a stranger is talking to reads that chat and decides on it; they never
	// write in it, so the composer is not there at all (19 第 2.3 节). A dissolved group, and one the
	// viewer was removed from, is read only for the same reason: the notice takes its place (19 3.2).
	const watchingVisit = conversation?.visit?.role === "host";
	const closed = Boolean(conversation?.closedReason);
	const dock = watchingVisit ? null : closed && conversation ? (
		<ClosedGroupNotice conversation={conversation} />
	) : (
		composer
	);

	return (
		<>
			<AppShell
				tab={{
					current: tab,
					onSelect: (id) => (meOpen && id === tab ? navigation.back(tabLocation) : navigation.open(tabPath(id))),
					labels,
					ariaLabel: t("nav.tabs"),
				}}
				desktop={isDesktopExperience()}
				renderAvatar={(size) => <Avatar name={person?.displayName ?? "?"} src={person?.avatarUrl} size={size} />}
				personName={person?.displayName ?? ""}
				meLabel={t("nav.me")}
				settingsLabel={t("nav.settings")}
				onOpenMe={() => navigation.open(splitMe ? meEntry : "/me")}
				meOpen={meOpen}
				me={me}
				onBack={back}
				backLabel={t("app.back")}
				mobileShowList={!detailOpen}
				list={deferred(list)}
				content={
					tab === "messages" ? (
						<FileDropZone
							key={conversation?.id}
							onFiles={draft.addFiles}
							disabled={!conversation || !draft.loaded || draft.sending || meOpen}
						>
							{deferred(content)}
						</FileDropZone>
					) : (
						deferred(content)
					)
				}
				detailOpen={detailOpen}
				composer={dock}
				status={
					<MeetingRecorderCapsule
						recorder={{
							...recorder,
							start: (title) => (recordingTarget ? recorder.start(title, recordingTarget.id) : Promise.resolve()),
						}}
						cloud={meetingCloud}
						canStart={Boolean(recordingTarget)}
						renderSummary={(body) => <MessageContent body={body} />}
						microphoneOccupied={shortVoiceActive}
						expanded={recorderOpen}
						onToggle={() => setRecorderOpen((open) => !open)}
					/>
				}
				titlebarInset={isMacDesktopShell()}
				brand={<Brand />}
				labels={{ showList: t("nav.showList"), hideList: t("nav.hideList"), resizeList: t("nav.resizeList") }}
				locationKey={segmentRoot ? tabPath(tab) : (tabLocation.split(/[?#]/)[0] ?? tabPath(tab))}
				onModeChange={setLayoutMode}
			/>
			<FrameOverlays
				layers={layers}
				conversation={conversation}
				personId={person?.id}
				mode={layoutMode}
				onBotDeleted={(chatId) => {
					if (chatId) removedConversation(chatId);
				}}
				onOpenMember={(member) => openMember(member.memberId)}
				onLeftGroup={() => navigation.back("/messages")}
			/>
			{preset.flying ? <FlyToComposer phrase={preset.flying} onDone={preset.flown} /> : null}
		</>
	);
}

function Brand() {
	return <AppIcon size={32} title="Yonder" />;
}
