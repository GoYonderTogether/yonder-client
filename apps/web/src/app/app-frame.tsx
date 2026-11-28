import { InviteRailButton, isMeSection, MeList } from "@yonder/feature-me";
import { ClosedGroupNotice } from "@yonder/feature-members";
import { Avatar, Logo } from "@yonder/ui-components";
import { useBot, useContacts, useConversations, useData, usePerson, useSkills } from "@yonder/ui-data";
import type { LayoutMode, TabId } from "@yonder/ui-shell";
import {
	AppShell,
	BOT_VISITS,
	BOT_VISITS_PATH,
	locate,
	MAIN_CONVERSATION,
	SidePanelProvider,
	tabPath,
} from "@yonder/ui-shell";
import type { ReactNode } from "react";
import { Suspense, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { useLocalFilesAdapter } from "../lib/local-files.ts";
import { isDesktopExperience, isMacDesktopShell } from "../lib/platform.ts";
import { messageListUnread, primaryConversation, selectedConversation } from "../pages/conversation-presentation.tsx";
import { readMemoryView, showsMemoryBack } from "../pages/memory/memory-view.ts";
import { ConversationPage, MessagesList } from "../pages/messages-page.tsx";
import { NotFoundPage } from "../pages/not-found-page.tsx";
import { BotTabAvatar } from "../pages/unread-badge.tsx";
import { UpdateReadyButton } from "../updates/ready-button.tsx";
import { UpdateTopNotice } from "../updates/top-notice.tsx";
import { useReconnectNotice } from "./app-notice.tsx";
import { AskMainBotProvider } from "./ask-main-bot.tsx";
import { ChunkBoundary } from "./chunk-boundary.tsx";
import { completionItems } from "./completion/items.ts";
import { mentionInDraft } from "./completion/mention-in-draft.ts";
import { Composer } from "./composer.tsx";
import { ComposerQuoteContext } from "./composer-quote.tsx";
import { ComposerStatus } from "./composer-status.tsx";
import { directConversationFor } from "./contact-conversation.ts";
import { useContactScreens } from "./contact-screens.tsx";
import { FileDropZone } from "./file-drop-zone.tsx";
import { MemoryList, MemoryPage, SettingsRoutePage, TaskPage, TasksList } from "./lazy-tabs.ts";
import { eligibleMeetingTarget, openMeetingSource, useMeetingRecordingSurface } from "./meeting-recording-surface.tsx";
import { MessageNotifications } from "./message-notifications.tsx";
import { PresenceReporter } from "./presence-reporter.tsx";
import { settingsPagePaths } from "./settings-navigation.ts";
import { DetailDiscardDialog, memberDetail, useSideStack } from "./side-panel.tsx";
import { BotPresetOverlay } from "./task-bot-drawer.tsx";
import { useContactAdded } from "./use-contact-added.ts";
import { useDetailTabs } from "./use-detail-tabs.ts";
import { useFrameBack } from "./use-frame-back.ts";
import { useFrameChat } from "./use-frame-chat.ts";
import { useFrameMeeting } from "./use-frame-meeting.ts";
import { useMeEntry } from "./use-me-entry.ts";
import { useMeetingLink } from "./use-meeting-link.ts";
import { useModelDirtyGuard } from "./use-model-dirty-guard.tsx";
import { type PageNavigationState, usePageNavigation } from "./use-page-navigation.ts";
import { MAIN_BOT_PATH, usePhoneTabs } from "./use-phone-tabs.ts";
import { useTaskPreset } from "./use-task-preset.ts";
/** Assembles the active list and detail; the shell owns their responsive layout. */
export function AppFrame() {
	const localFiles = useLocalFilesAdapter();
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const person = usePerson();
	const bot = useBot();
	const meeting = useFrameMeeting(person?.id ?? null);
	const desktop = isDesktopExperience();
	const { realtime, storage, api } = useData();
	const connectionStatus = useSyncExternalStore(
		realtime.subscribe,
		() => realtime.status,
		() => "idle",
	);
	const disconnected = connectionStatus === "reconnecting";
	const conversations = useConversations();
	const skills = useSkills();
	const contacts = useContacts();
	const [layoutMode, setLayoutMode] = useState<LayoutMode | null>(null);
	const [sideCover, setSideCover] = useState(false);
	const [composerAttachmentOpen, setComposerAttachmentOpen] = useState(false);
	const [chatOpen, setChatOpen] = useState(0);
	const phone = !desktop && (layoutMode === "mobile" || layoutMode === null);
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
	const visitsRoute = tab === "messages" && openedDetail === BOT_VISITS;
	const visitFolder = visitsRoute && !subSelection;
	const selection =
		(visitsRoute ? (subSelection ?? BOT_VISITS) : openedDetail) ??
		(desktop && layoutMode === "wide" && tab === "messages" ? MAIN_CONVERSATION : null);
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
	useContactAdded(navigation);
	const messageSelection = tab === "messages" ? selection : null;
	const contactConversation = directConversationFor(
		tab === "contacts" ? selection : null,
		contacts.data?.items,
		conversations.data?.items,
	);
	const conversation =
		tab === "contacts"
			? contactConversation
			: selectedConversation(conversations.data?.items, messageSelection, bot?.id, visitsRoute);
	const watchingVisit = conversation?.visit?.role === "host";
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
	const unreadCount = messageListUnread(conversations.data?.items, primary?.id, phone);
	const mainBot = tab === "messages" && !visitsRoute && (selection === MAIN_CONVERSATION || selection === primary?.id);
	const mobileBot = phone && mainBot;
	const tabs = usePhoneTabs(navigation, phone, mobileBot);
	const recordingConversation = eligibleMeetingTarget(
		!taskSelection ? conversation : undefined,
		(id) =>
			id === bot?.id ||
			Boolean(contacts.data?.items.some((member) => member.id === id && person && member.ownerId === person.id)),
	);
	useMeetingLink();
	const layers = useDetailTabs(desktop, person?.id, path, meOpen);
	const {
		modelDirty,
		setBotDirty,
		isDirty,
		dialog: discardDialog,
	} = useModelDirtyGuard(layoutMode ?? "mobile", desktop, layers);
	const openMember = useEffectEvent((memberId: string) => {
		const member =
			(memberId === bot?.id ? bot : contacts.data?.items.find((item) => item.id === memberId)) ??
			conversation?.members.find((item) => item.memberId === memberId);
		const entry = member ? memberDetail(member, person?.id, bot, contacts.data?.items, conversation?.id) : null;
		if (entry) layers.open(entry);
	});
	/** A deleted Bot's chat leaves the list over the socket; if it is on screen, go back to the list (17 3.1). */
	const removedConversation = useEffectEvent((conversationId: string) => {
		layers.removeConversation(conversationId);
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
		settings: meOpen,
		conversations: conversations.data?.items,
		personId: person?.id,
		defaultBot: bot,
		contacts: contacts.data?.items,
		onBotDeleted: (chatId) => {
			if (chatId) removedConversation(chatId);
		},
		onLeftGroup: (id) => {
			if (conversation?.id === id) navigation.back("/messages");
		},
	});
	const preset = useTaskPreset({
		person,
		primary,
		conversation: taskSelection ? undefined : conversation,
		draft,
		open: navigation.open,
		mobile: phone && !taskSelection,
		path: location.pathname,
	});
	const memoryView = readMemoryView(tab === "memory" ? selection : null, subSelection);
	const primaryResource =
		taskSelection && taskSelection !== "new"
			? `task:${taskSelection}`
			: memoryView.kind === "file"
				? `memory:${memoryView.path}`
				: null;
	const sideControls = useMemo(() => ({ ...layers.controls, primaryResource }), [layers.controls, primaryResource]);
	const memoryTimeline = memoryView.kind === "timeline" || (memoryView.kind === "home" && layoutMode === "wide");
	const segmentRoot = tab === "tasks" && selection === "scheduled";
	const detailOpen = selection !== null && !segmentRoot;
	const back = useFrameBack({ navigation, tabs, tab, tabLocation, splitMe, search: location.search });
	const contactScreens = useContactScreens(tab === "contacts" ? selection : null, contacts.data?.items, navigation);
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
				key={pagePath.startsWith("/me/models/") ? location.key : pagePath}
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
				}}
			/>
		);
	}
	function screensFor(): { list: ReactNode | null; content: ReactNode } {
		switch (tab) {
			case "messages": {
				const messageList = (incoming = false) => (
					<MessagesList
						current={selection}
						contacts={contacts.data?.items}
						incoming={incoming}
						visitsSelected={visitsRoute || watchingVisit}
						acceptImageDrop={desktop && !incoming && !meOpen}
						onOpenVisits={() => (visitsRoute ? !visitFolder && back() : tabs.go(BOT_VISITS_PATH))}
						onOpen={(id, drop) => {
							if (drop) chat.queueImageDrop(drop);
							setChatOpen((previous) => previous + 1);
							tabs.go(`${incoming ? BOT_VISITS_PATH : "/messages"}/${encodeURIComponent(id)}`);
						}}
						onOpenMeetings={() => recordingSurface.start(primary)}
					/>
				);
				return {
					list: mobileBot ? null : messageList(),
					content: visitFolder ? (
						messageList(true)
					) : visitsRoute && !conversation && conversations.data ? (
						<NotFoundPage />
					) : (
						<ConversationPage
							key={`${selection ? (conversation?.id ?? "") : ""}:${chatOpen}`}
							conversationId={selection ? (conversation?.id ?? null) : null}
							disconnected={disconnected}
							mainBotHome={mainBot}
							contacts={contacts.data?.items}
							readActive={!meOpen && !sideCover && !preset.drawerOpen}
							onOpenMeeting={(id) => navigation.open(`/tasks/${encodeURIComponent(id)}`)}
							onOpenMember={openMember}
							onMention={draft.loaded ? (id, name) => mentionInDraft(draft, id, name) : undefined}
							onOpenGroup={() => {
								if (conversation?.kind === "group") layers.open({ kind: "group", conversationId: conversation.id });
							}}
						/>
					),
				};
			}
			case "tasks":
				return {
					list: (
						<TasksList
							scheduled={selection === "scheduled"}
							selectedItemId={desktop ? taskSelection : null}
							onChange={(value) => navigation.open(value ? "/tasks/scheduled" : "/tasks")}
							onOpenItem={(id) => navigation.open(`/tasks/${encodeURIComponent(id)}`)}
							onAddItem={preset.addItem}
							onAddGoal={preset.addGoal}
						/>
					),
					content: (
						<TaskPage
							taskId={taskSelection}
							session={chat.itemSession}
							disconnected={disconnected}
							readActive={!meOpen && !sideCover}
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
				if (contactConversation)
					return {
						...contactScreens,
						content: (
							<ConversationPage
								key={contactConversation.id}
								conversationId={contactConversation.id}
								disconnected={disconnected}
								contacts={contacts.data?.items}
								readActive={!meOpen && !sideCover && !preset.drawerOpen}
								onOpenMember={openMember}
								onMention={draft.loaded ? (id, name) => mentionInDraft(draft, id, name) : undefined}
							/>
						),
					};
				return side.expanded && selection === null ? { ...contactScreens, content: null } : contactScreens;
		}
	}
	const composer = (
		<Composer
			microphoneOccupied={Boolean(meeting.active || meeting.interrupted || meeting.recorder.busy)}
			onVoiceActivityChange={meeting.setShortVoiceActive}
			recipientName={
				(taskSelection || tab === "messages" || contactConversation ? chat.recipientName : undefined) ??
				bot?.displayName ??
				null
			}
			draft={draft.text}
			onDraftChange={draft.setText}
			readOnly={!draft.loaded}
			editorRef={chat.editorRef}
			files={draft.files}
			onFiles={draft.addFiles}
			pickedFiles={chat.directAttachments.enabled ? chat.directAttachments : undefined}
			onRemoveFile={draft.removeFile}
			onRetryFile={draft.retryFile}
			onOriginalFileChange={draft.toggleOriginal}
			scope={`${person?.id}:${chat.scope}`}
			mobilePicker={!desktop}
			onAttachmentPanelChange={mobileBot && !preset.drawerOpen ? setComposerAttachmentOpen : undefined}
			onMeeting={recordingConversation ? () => recordingSurface.start(recordingConversation) : undefined}
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
			visitRelay={tab === "messages" ? chat.visitRelay : undefined}
			onAcceptCompletion={draft.acceptCompletion}
			onCompact={compact.run}
			commandStatus={<ComposerStatus compact={compact} />}
			onSendVoice={chat.submitVoice}
			speech={{ transcription: api, knownNonce: chat.knownVoiceNonce }}
			onSend={() => {
				void chat.submit();
				if (taskSelection || !conversation) return;
				if (!preset.drawerOpen && (tab !== "messages" || !selection)) tabs.go(MAIN_BOT_PATH);
			}}
		/>
	);
	const labels: Record<TabId, string> = {
		messages: t("nav.messages"),
		tasks: t("nav.tasks"),
		memory: t("nav.memory"),
		contacts: t("chatActions.contacts"),
	};
	const dock = taskSelection ? (
		composer
	) : (tab !== "messages" && !memoryTimeline && !contactConversation) ||
		visitsRoute ||
		watchingVisit ||
		conversation?.kind === "system" ? null : conversation?.closedReason && conversation ? (
		<ClosedGroupNotice conversation={conversation} />
	) : (
		composer
	);
	const chatVisible = !meOpen && dock === composer && Boolean(chat.target || taskSelection === "new");
	useReconnectNotice(disconnected, chatVisible, person?.id);
	const recordingSurface = useMeetingRecordingSurface(
		person?.id ?? null,
		chatVisible && detailOpen && !preset.drawerOpen && tab === "messages" ? conversation?.id : undefined,
		meeting,
		(target) => openMeetingSource(detailOpen ? conversation?.id : undefined, target.id, primary?.id, tabs.go),
	);
	return (
		<ComposerQuoteContext value={chat.quote}>
			<AskMainBotProvider value={preset.ask}>
				<SidePanelProvider value={sideControls}>
					<AppShell
						tab={{
							current: tab,
							onSelect: (id) => (meOpen && id === tab ? navigation.back(tabLocation) : tabs.go(tabPath(id))),
							labels,
							ariaLabel: t("nav.tabs"),
							messagesUnread: { count: unreadCount, label: t("messages.unread", { count: unreadCount }) },
							mobileBot: {
								label: bot?.selectedNickname || bot?.displayName || t("nav.mainBot"),
								active: mobileBot,
								icon: <BotTabAvatar bot={bot} unreadCount={primary?.unreadCount} muted={primary?.muted} />,
								onSelect: () => tabs.go(MAIN_BOT_PATH),
							},
						}}
						desktop={desktop}
						renderAvatar={(size) => <Avatar name={person?.displayName ?? "?"} src={person?.avatarUrl} size={size} />}
						personName={person?.displayName ?? ""}
						meLabel={t("nav.me")}
						settingsLabel={t("nav.settings")}
						updateAction={<UpdateReadyButton />}
						inviteAction={<InviteRailButton section={section} onOpen={navigation.open} />}
						onOpenMe={() => navigation.open(splitMe ? meEntry : "/me")}
						meOpen={meOpen}
						me={me}
						side={side}
						onBack={meOpen ? back : (contactScreens.onBack ?? back)}
						backLabel={t(visitsRoute && !visitFolder ? "visits.incomingBack" : "app.back")}
						showContentBack={
							showsMemoryBack(memoryView) || (visitsRoute && !visitFolder) || Boolean(contactScreens.onBack)
						}
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
						composerAttachmentOpen={composerAttachmentOpen}
						status={preset.drawerOpen ? null : recordingSurface.status}
						titlebarInset={isMacDesktopShell()}
						brand={<Logo size={32} title="Yonder" />}
						labels={{ showList: t("nav.showList"), hideList: t("nav.hideList"), resizeList: t("nav.resizeList") }}
						locationKey={segmentRoot ? tabPath(tab) : (tabLocation.split(/[?#]/)[0] ?? tabPath(tab))}
						onModeChange={setLayoutMode}
						onSideCoverChange={setSideCover}
					/>
					<BotPresetOverlay
						preset={preset}
						title={bot?.displayName ?? ""}
						conversationId={conversation?.id ?? null}
						disconnected={disconnected}
						status={preset.drawerOpen ? recordingSurface.status : null}
					>
						{composer}
					</BotPresetOverlay>
					<UpdateTopNotice
						recording={Boolean(meeting.active || meeting.shortVoiceActive)}
						busy={() => !meeting.recorder.ready || meeting.recorder.busy || draft.sending || isDirty()}
						persist={draft.preserveBeforeReload}
					/>
					{recordingSurface.dialog}
					{discardDialog}
					<DetailDiscardDialog layers={layers} mode={layoutMode ?? "mobile"} desktop={desktop} />
					<PresenceReporter conversationId={tab === "messages" && conversation ? conversation.id : null} />
					<MessageNotifications
						key={person?.id}
						personId={person?.id}
						conversationId={tab === "messages" && conversation ? conversation.id : null}
						onOpen={(id) => tabs.go(id === primary?.id ? MAIN_BOT_PATH : `/messages/${encodeURIComponent(id)}`)}
					/>
				</SidePanelProvider>
			</AskMainBotProvider>
		</ComposerQuoteContext>
	);
}
