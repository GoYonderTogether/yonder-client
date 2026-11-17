import { PasswordSetupForm } from "@yonder/feature-auth";
import { isMeSection, MeList, MeSectionPage } from "@yonder/feature-me";
import { MeetingRecorderCapsule } from "@yonder/feature-meetings";
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
import { useBlocker, useLocation, useNavigate } from "react-router";
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
import { draftKey, type PresetOutcome, registerPresetTarget, requestPreset } from "./draft-preset.ts";
import { FileDropZone } from "./file-drop-zone.tsx";
import { useChatDraft } from "./use-chat-draft.ts";
import { useHasPassword } from "./use-has-password.ts";
import { useMeEntry } from "./use-me-entry.ts";
import { useMeetingCloud } from "./use-meeting-cloud.ts";
import { useMeetingRecorder } from "./use-meeting-recorder.ts";
import { usePageNavigation } from "./use-page-navigation.ts";

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
	/** The sentence the plus button just put into the message box, while its fly-in is showing. */
	const [flying, setFlying] = useState<string | null>(null);
	const modelDirty = useRef(false);
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
	const streaming = history.data?.pages
		.flatMap((page) => page.items)
		.findLast((message) => message.senderKind === "bot" && message.streaming);
	// The plus button on 「事项 | 目标」 hands its sentence to this composer (16-3 第十节). The apply
	// reads the draft through its own setters, so a draft the user already typed in is never touched.
	const applyPreset = useEffectEvent((phrase: string): PresetOutcome => {
		if (!draft.loaded) return "not-ready";
		if (draft.text.trim()) return "refused";
		draft.setText(phrase);
		return "applied";
	});
	useEffect(() => {
		if (!person || !conversation) return;
		const key = draftKey(person.id, conversation.id);
		return registerPresetTarget(key, (phrase) => applyPreset(phrase));
	}, [person, conversation]);
	const segmentRoot = (tab === "tasks" && selection === "scheduled") || (tab === "memory" && selection === "files");
	const detailOpen = selection !== null && !segmentRoot;
	const blocker = useBlocker(() => modelDirty.current);
	useEffect(() => {
		if (blocker.state !== "blocked") return;
		if (window.confirm(t("models.discard"))) {
			modelDirty.current = false;
			blocker.proceed();
		} else blocker.reset();
	}, [blocker, t]);
	useEffect(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (modelDirty.current) event.preventDefault();
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, []);
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
			/>
		);
	}

	/**
	 * The plus button (16-3 第十节): navigate to the main Bot's chat and put a preset sentence in its
	 * draft, never sending it. The navigation comes first, the fill follows at once, and the fly-in is
	 * only feedback — a draft the user already typed in is never overwritten.
	 */
	function addFromTasks(scheduled: boolean) {
		const primary = primaryConversation(conversations.data?.items, bot?.id);
		const phrase = t(scheduled ? "tasks.presetGoal" : "tasks.presetItem");
		navigation.open(`/messages/${MAIN_CONVERSATION}`);
		if (!person || !primary) return;
		requestPreset(person.id, primary.id, phrase);
		setFlying(phrase);
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
							onAdd={() => addFromTasks(selection === "scheduled")}
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
				composer={composer}
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
			{flying ? <FlyToComposer phrase={flying} onDone={() => setFlying(null)} /> : null}
		</>
	);
}

function Brand() {
	return <AppIcon size={32} title="Yonder" />;
}
