import { isMeSection, MeList } from "@yonder/feature-me";
import { MeetingRecorderCapsule } from "@yonder/feature-meetings";
import { ClosedGroupNotice } from "@yonder/feature-members";
import { AppIcon, Avatar } from "@yonder/ui-components";
import {
	keys,
	useBot,
	useContacts,
	useConversations,
	useData,
	useDataQueryClient,
	useHealth,
	usePerson,
	useSkills,
} from "@yonder/ui-data";
import type { LayoutMode, TabId } from "@yonder/ui-shell";
import { AppShell, locate, MAIN_CONVERSATION, SidePanelProvider, tabPath } from "@yonder/ui-shell";
import type { ReactNode } from "react";
import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { listenForContactAdded } from "../lib/contact-window.ts";
import { useLocalFilesAdapter } from "../lib/local-files.ts";
import { isDesktopExperience, isMacDesktopShell } from "../lib/platform.ts";
import { ContactsPageList, ContactsPagePlaceholder } from "../pages/contacts-list.tsx";
import {
	conversationPeer,
	conversationTitle,
	primaryConversation,
	selectedConversation,
} from "../pages/conversation-presentation.tsx";
import { FlyToComposer } from "../pages/items-fly.tsx";
import { memoryDetailParent, readMemoryView } from "../pages/memory/memory-view.ts";
import { ConversationPage, MessagesList } from "../pages/messages-page.tsx";
import { NotFoundPage } from "../pages/not-found-page.tsx";
import { BotTabAvatar } from "../pages/unread-badge.tsx";
import { UpdateReadyButton } from "../updates/ready-button.tsx";
import { useReconnectNotice } from "./app-notice.tsx";
import { ChunkBoundary } from "./chunk-boundary.tsx";
import { CompactStatus } from "./completion/compact-status.tsx";
import { completionItems } from "./completion/items.ts";
import { Composer } from "./composer.tsx";
import { FileDropZone } from "./file-drop-zone.tsx";
import { MessageNotifications } from "./message-notifications.tsx";
import { settingsPagePaths } from "./settings-navigation.ts";
import { SettingsRoutePage } from "./settings-pages.tsx";
import { useFrameLayers, useSideStack } from "./side-panel.tsx";
import { TaskBotDrawer } from "./task-bot-drawer.tsx";
import { useFrameChat } from "./use-frame-chat.ts";
import { useFrameMeeting } from "./use-frame-meeting.ts";
import { useMeEntry } from "./use-me-entry.ts";
import { useMeetingLink } from "./use-meeting-link.ts";
import { useModelDirtyGuard } from "./use-model-dirty-guard.ts";
import { type PageNavigationState, usePageNavigation } from "./use-page-navigation.ts";
import { useTaskPreset } from "./use-task-preset.ts";

const MemoryList = lazy(() => import("../pages/memory-page.tsx").then((module) => ({ default: module.MemoryList })));
const MemoryPage = lazy(() => import("../pages/memory-page.tsx").then((module) => ({ default: module.MemoryPage })));
const TasksList = lazy(() => import("../pages/tasks-page.tsx").then((module) => ({ default: module.TasksList })));
const TaskPage = lazy(() => import("../pages/tasks-page.tsx").then((module) => ({ default: module.TaskPage })));

export function AppFrame() {
	const localFiles = useLocalFilesAdapter();
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const person = usePerson();
	const bot = useBot();
	const meeting = useFrameMeeting(person?.id ?? null);
	const desktop = isDesktopExperience();
	const { realtime, storage } = useData();
	const connectionStatus = useSyncExternalStore(
		realtime.subscribe,
		() => realtime.status,
		() => "idle",
	);
	const disconnected = connectionStatus === "reconnecting";
	const conversations = useConversations();
	const health = useHealth();
	const skills = useSkills();
	const contacts = useContacts();
	const [layoutMode, setLayoutMode] = useState<LayoutMode | null>(null);
	const [chatOpen, setChatOpen] = useState(0);
	const phone = !desktop && (layoutMode === "mobile" || layoutMode === null);
	const { modelDirty, setBotDirty } = useModelDirtyGuard();
	const previousLocation = useRef("/messages");

	const located = locate(location.pathname);
	const meOpen = located !== null && located.tab === null;
	const path = `${location.pathname}${location.search}${location.hash}`;
	useEffect(() => {
		if (located?.tab) previousLocation.current = path;
	}, [located?.tab, path]);
	const settingsState = location.state as PageNavigationState | null;
	const remembered = settingsState?.tabLocation;
	const tabLocation = meOpen ? remembered || previousLocation.current : path;
	const base = meOpen ? locate(tabLocation.split(/[?#]/)[0] ?? "/messages") : located;
	const tab = base?.tab ?? "messages";
	const [openedDetail = null, subSelection = null] = base?.detail ?? [];
	const selection = openedDetail ?? (desktop && layoutMode === "wide" && tab === "messages" ? MAIN_CONVERSATION : null);
	const settingsDetail = meOpen ? located.detail : [];
	const [first = null] = settingsDetail;
	const section = first && isMeSection(first) ? first : null;
	const meEntry = useMeEntry(storage, person?.id, section);
	const splitMe = desktop && layoutMode === "wide";
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
	const taskSelection = tab === "tasks" && selection !== "scheduled" ? selection : null;
	const chat = useFrameChat({
		personId: person?.id,
		conversation,
		task: taskSelection,
		onCreated: (id) => {
			if (navigation.current() === "/tasks/new") navigate(`/tasks/${encodeURIComponent(id)}`, { replace: true });
		},
	});
	const { draft, compact } = chat;
	const primary = primaryConversation(conversations.data?.items, bot?.id);
	const unreadCount =
		conversations.data?.items.reduce(
			(total, item) => total + (phone && (item.id === primary?.id || item.muted) ? 0 : (item.unreadCount ?? 0)),
			0,
		) ?? 0;
	const mainBot = tab === "messages" && (selection === MAIN_CONVERSATION || selection === primary?.id);
	const mobileBot = phone && mainBot;
	const recordingConversation =
		!taskSelection &&
		conversation?.kind === "direct" &&
		!conversation.visit &&
		conversation.members.some(
			({ memberId, kind }) =>
				kind === "bot" &&
				(memberId === bot?.id ||
					contacts.data?.items.some((member) => member.id === memberId && person && member.ownerId === person.id)),
		)
			? conversation
			: undefined;
	useMeetingLink();
	const layers = useFrameLayers();
	/** From the chat a member replaces the side panel; from inside it (group info) one stacks on it. */
	const openMember = useEffectEvent((memberId: string, stacked = false) => {
		const ownsDefaultBot = bot?.id === memberId;
		const member = contacts.data?.items.find((item) => item.id === memberId);
		const listed = conversation?.members.find((item) => item.memberId === memberId);
		const handle = member?.handle ?? listed?.handle;
		const entry =
			ownsDefaultBot || (member?.kind === "bot" && member.ownerId === person?.id)
				? ({ kind: "bot", id: memberId } as const)
				: handle
					? ({ kind: "member", handle } as const)
					: null;
		if (entry) (stacked ? layers.push : layers.open)(entry);
	});
	/**
	 * A deleted Bot's chat leaves the list over the socket; if it is the one on screen, the frame
	 * goes back to the message list rather than showing an empty page (17 3.1).
	 */
	const removedConversation = useEffectEvent((conversationId: string) => {
		layers.clear();
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
	const side = useSideStack({
		layers,
		conversation,
		personId: person?.id,
		defaultBot: bot,
		contacts: contacts.data?.items,
		onBotDirtyChange: setBotDirty,
		onBotDeleted: (chatId) => {
			if (chatId) removedConversation(chatId);
		},
		onOpenMember: (member) => openMember(member.memberId, true),
		onLeftGroup: () => navigation.back("/messages"),
	});
	// The panel belongs to what is on screen: moving to another chat, tab or page closes it.
	const closeSide = useEffectEvent(() => layers.clear());
	useEffect(() => {
		if (location.pathname) closeSide();
	}, [location.pathname]);
	const preset = useTaskPreset({
		person,
		bot,
		conversation: taskSelection ? undefined : conversation,
		conversations: conversations.data?.items,
		draft,
		open: navigation.open,
		mobile: phone,
		path: location.pathname,
	});
	const memoryView = readMemoryView(tab === "memory" ? selection : null, subSelection);
	const segmentRoot = tab === "tasks" && selection === "scheduled";
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
		if (live?.tab === "memory") return navigation.back(memoryDetailParent(live.detail));
		if (!liveMeOpen) return navigation.back(tabPath(live?.tab ?? tab));
		const state = navigation.currentState();
		const parent = settingsPagePaths(live.detail, state?.channelOriginBotId).at(-2);
		if (parent === "/me/channels")
			return navigation.back(state?.channelParentPath ?? `${parent}${location.search}`, state ?? undefined);
		if (parent?.startsWith("/me/channels/")) return navigation.back(`${parent}${location.search}`, state ?? undefined);
		if (parent) return navigation.back(parent);
		if (live.detail.length && !splitMe) return navigation.back("/me");
		return navigation.back(tabLocation);
	};
	const backRef = useRef(currentBack);
	backRef.current = currentBack;
	const back = useCallback(() => backRef.current(), []);

	const { list, content } = base ? screensFor() : { list: null, content: <NotFoundPage /> };
	const me = meOpen
		? {
				list: <MeList current={section} onOpen={(id) => navigation.open(`/me/${id}`)} />,
				pages: settingsPagePaths(settingsDetail, settingsState?.channelOriginBotId).map((key) => ({
					key,
					content: deferred(mePage(key)),
				})),
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

	function mePage(pagePath: string): ReactNode {
		return (
			<SettingsRoutePage
				path={pagePath}
				onOpen={navigation.open}
				onBack={navigation.back}
				onBotDirtyChange={setBotDirty}
				onBotDeleted={(chatId) => {
					if (chatId) removedConversation(chatId);
				}}
				legacy={{
					localFiles,
					onModelDirtyChange: (dirty) => {
						modelDirty.current = dirty;
					},
					serverVersion: health.data?.version ?? null,
				}}
			/>
		);
	}

	function screensFor(): { list: ReactNode | null; content: ReactNode } {
		switch (tab) {
			case "messages":
				return {
					list: mobileBot ? null : (
						<MessagesList
							current={selection}
							contacts={contacts.data?.items}
							onOpen={(id) => {
								setChatOpen((previous) => previous + 1);
								navigation.open(`/messages/${encodeURIComponent(id)}`);
							}}
							onOpenMeetings={() => meeting.start(primary)}
						/>
					),
					content: (
						<ConversationPage
							key={`${selection ? (conversation?.id ?? "") : ""}:${chatOpen}`}
							conversationId={selection ? (conversation?.id ?? null) : null}
							disconnected={disconnected}
							mainBotHome={mainBot}
							contacts={contacts.data?.items}
							readActive={!meOpen && !side.pages.length && !preset.drawerOpen}
							onOpenMeeting={(id) => navigation.open(`/tasks/${encodeURIComponent(id)}`)}
							onOpenMember={openMember}
							onOpenGroup={layers.openGroup}
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
							onAdd={selection === "scheduled" ? preset.addGoal : () => navigation.open("/tasks/new")}
							onSchedule={preset.addSchedule}
						/>
					),
					content: (
						<TaskPage
							taskId={taskSelection}
							session={chat.itemSession}
							disconnected={disconnected}
							readActive={!meOpen && !side.pages.length}
							onOpenConversation={(id) => navigation.open(`/messages/${encodeURIComponent(id)}`)}
						/>
					),
				};
			case "memory":
				return {
					list: <MemoryList view={memoryView} />,
					content: <MemoryPage view={memoryView} />,
				};
			case "contacts":
				return {
					list: <ContactsPageList onOpen={(handle) => navigation.open(`/@${encodeURIComponent(handle)}`)} />,
					content: contacts.data?.items.some((member) => member.kind === "person") ? <ContactsPagePlaceholder /> : null,
				};
		}
	}

	const talkingTo =
		taskSelection && chat.target
			? conversationPeer(chat.target, person?.id)?.displayName
			: tab === "messages" && conversation
				? conversationTitle(conversation, person?.id)
				: undefined;
	const composer = (
		<Composer
			microphoneOccupied={Boolean(meeting.active || meeting.recorder.busy)}
			onVoiceActivityChange={meeting.setShortVoiceActive}
			recipientName={talkingTo ?? bot?.displayName ?? null}
			draft={draft.text}
			onDraftChange={draft.setText}
			readOnly={!draft.loaded}
			files={draft.files}
			onFiles={draft.addFiles}
			pickedFiles={chat.directAttachments.enabled ? chat.directAttachments : undefined}
			onRemoveFile={draft.removeFile}
			onRetryFile={draft.retryFile}
			onOriginalFileChange={draft.toggleOriginal}
			scope={`${person?.id}:${chat.scope}`}
			mobilePicker={!desktop}
			showMobilePlaceholder={Boolean(taskSelection)}
			onMeeting={recordingConversation ? () => meeting.start(recordingConversation) : undefined}
			error={draft.error || chat.directAttachments.error}
			disabled={chat.blocked || disconnected}
			disconnected={disconnected}
			sendOnEnter={desktop}
			streaming={chat.streaming}
			completionItems={completionItems(
				chat.hasBot ? (skills.data?.items ?? []) : [],
				contacts.data?.items ?? [],
				chat.target?.members ?? [],
				bot,
				chat.target ? t("skills.compact") : undefined,
			)}
			selectedSkillIds={draft.skillIds}
			bindings={draft.bindings ?? []}
			onAcceptCompletion={draft.acceptCompletion}
			onCompact={compact.run}
			commandStatus={<CompactStatus command={compact} />}
			onSendVoice={chat.submit}
			onSend={() => {
				void chat.submit();
				if (taskSelection || !conversation) return;
				if (!preset.drawerOpen && (tab !== "messages" || !selection)) navigation.open(`/messages/${MAIN_CONVERSATION}`);
			}}
		/>
	);
	const labels: Record<TabId, string> = {
		messages: t("nav.messages"),
		tasks: t("nav.tasks"),
		memory: t("nav.memory"),
		contacts: t("chatActions.contacts"),
	};
	// The owner of a Bot a stranger is talking to reads that chat and decides on it; they never
	// write in it, so the composer is not there at all (19 第 2.3 节). A dissolved group, and one the
	// viewer was removed from, is read only for the same reason: the notice takes its place (19 3.2).
	const watchingVisit = conversation?.visit?.role === "host";
	const closed = Boolean(conversation?.closedReason);
	const dock = taskSelection ? (
		composer
	) : tab !== "messages" || watchingVisit || conversation?.kind === "system" ? null : closed && conversation ? (
		<ClosedGroupNotice conversation={conversation} />
	) : (
		composer
	);
	const chatVisible = !meOpen && dock === composer && Boolean(chat.target || taskSelection === "new");
	useReconnectNotice(disconnected, chatVisible, person?.id);
	const meetingStatus =
		meeting.active || meeting.recorder.busy ? <MeetingRecorderCapsule recorder={meeting.recorder} /> : null;

	return (
		<SidePanelProvider value={layers.controls}>
			<AppShell
				tab={{
					current: tab,
					onSelect: (id) => (meOpen && id === tab ? navigation.back(tabLocation) : navigation.open(tabPath(id))),
					labels,
					ariaLabel: t("nav.tabs"),
					messagesUnread: { count: unreadCount, label: t("messages.unread", { count: unreadCount }) },
					mobileBot: {
						label: bot?.selectedNickname || bot?.displayName || t("nav.mainBot"),
						active: mobileBot,
						icon: <BotTabAvatar bot={bot} unreadCount={primary?.unreadCount} muted={primary?.muted} />,
						onSelect: () => navigation.open(`/messages/${MAIN_CONVERSATION}`),
					},
				}}
				desktop={desktop}
				renderAvatar={(size) => <Avatar name={person?.displayName ?? "?"} src={person?.avatarUrl} size={size} />}
				personName={person?.displayName ?? ""}
				meLabel={t("nav.me")}
				settingsLabel={t("nav.settings")}
				updateAction={<UpdateReadyButton />}
				onOpenMe={() => navigation.open(splitMe ? meEntry : "/me")}
				meOpen={meOpen}
				me={me}
				side={side}
				onBack={back}
				backLabel={t("app.back")}
				mobileShowList={!detailOpen}
				list={list ? deferred(list) : null}
				content={
					tab === "messages" ? (
						<FileDropZone
							key={conversation?.id}
							onFiles={draft.addFiles}
							disabled={!conversation || conversation.kind === "system" || !draft.loaded || draft.sending || meOpen}
						>
							{deferred(content)}
						</FileDropZone>
					) : (
						deferred(content)
					)
				}
				detailOpen={detailOpen}
				composer={preset.drawerOpen ? null : dock}
				status={preset.drawerOpen ? null : meetingStatus}
				titlebarInset={isMacDesktopShell()}
				brand={<AppIcon size={32} title="Yonder" />}
				labels={{ showList: t("nav.showList"), hideList: t("nav.hideList"), resizeList: t("nav.resizeList") }}
				locationKey={segmentRoot ? tabPath(tab) : (tabLocation.split(/[?#]/)[0] ?? tabPath(tab))}
				onModeChange={setLayoutMode}
			/>
			<TaskBotDrawer
				open={preset.drawerOpen}
				onClose={preset.closeDrawer}
				title={bot?.displayName ?? ""}
				conversationId={conversation?.id ?? null}
				disconnected={disconnected}
				status={preset.drawerOpen ? meetingStatus : null}
			>
				{composer}
			</TaskBotDrawer>
			<MessageNotifications
				key={person?.id}
				personId={person?.id}
				onOpen={(id) => navigation.open(`/messages/${encodeURIComponent(id)}`)}
			/>
			{preset.flying ? <FlyToComposer phrase={preset.flying} onDone={preset.flown} /> : null}
		</SidePanelProvider>
	);
}
