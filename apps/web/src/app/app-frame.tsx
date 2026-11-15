import { PasswordSetupForm } from "@yonder/feature-auth";
import { isMeSection, MeList, MeSectionPage } from "@yonder/feature-me";
import { AppIcon, Avatar } from "@yonder/ui-components";
import {
	useBot,
	useConversations,
	useData,
	useHealth,
	useMessages,
	usePerson,
	useRunActions,
	useSendMessage,
} from "@yonder/ui-data";
import type { LayoutMode, TabId } from "@yonder/ui-shell";
import { AppShell, locate, MAIN_CONVERSATION, tabPath } from "@yonder/ui-shell";
import type { ReactNode } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useBlocker, useLocation, useNavigate } from "react-router";
import { BUILD_VERSION } from "../lib/config.ts";
import { isMacDesktopShell } from "../lib/platform.ts";
import { MemoryList, MemoryPage } from "../pages/memory-page.tsx";
import { ConversationPage, MessagesList } from "../pages/messages-page.tsx";
import { NotFoundPage } from "../pages/not-found-page.tsx";
import { TaskPage, TasksList } from "../pages/tasks-page.tsx";
import { Composer } from "./composer.tsx";
import { useHasPassword } from "./use-has-password.ts";

/** Assembles the active list and detail; the shell owns their responsive layout. */
export function AppFrame() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const person = usePerson();
	const bot = useBot();
	const { realtime } = useData();
	const connectionStatus = useSyncExternalStore(
		realtime.subscribe,
		() => realtime.status,
		() => "idle",
	);
	const disconnected = connectionStatus === "reconnecting";
	const conversations = useConversations();
	const health = useHealth();
	const hasPassword = useHasPassword();
	const [draft, setDraft] = useState("");
	const [layoutMode, setLayoutMode] = useState<LayoutMode>("wide");
	const modelDirty = useRef(false);
	const lastTab = useRef<TabId>("messages");
	const previousLocation = useRef("/messages");

	const located = locate(location.pathname);
	const meOpen = located !== null && located.tab === null;
	useEffect(() => {
		if (located?.tab) {
			lastTab.current = located.tab;
			previousLocation.current = `${location.pathname}${location.search}${location.hash}`;
		}
	}, [located?.tab, location.pathname, location.search, location.hash]);
	const tab = located?.tab ?? lastTab.current;
	const [first = null, second = null] = located?.detail ?? [];
	const messageSelection = tab === "messages" ? first : null;
	const conversation =
		messageSelection && messageSelection !== MAIN_CONVERSATION
			? conversations.data?.items.find((item) => item.id === messageSelection)
			: conversations.data?.items[0];
	const history = useMessages(conversation?.id ?? null);
	const send = useSendMessage(conversation?.id ?? null, person?.id);
	const actions = useRunActions();
	const streaming = history.data?.pages
		.flatMap((page) => page.items)
		.findLast((message) => message.senderKind === "bot" && message.streaming);
	const segmentRoot = (tab === "tasks" && first === "scheduled") || (tab === "memory" && first === "files");
	const detailOpen = meOpen || (first !== null && !segmentRoot);
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
	const back = () => {
		if (!meOpen) return navigate(tabPath(tab));
		if (second) return navigate(`/me/${first}`);
		if (first) return navigate("/me");
		return navigate(previousLocation.current);
	};

	const { list, content } = located ? screensFor() : { list: null, content: <NotFoundPage /> };

	function screensFor(): { list: ReactNode | null; content: ReactNode } {
		if (meOpen) {
			const section = first && isMeSection(first) ? first : null;
			return {
				list: <MeList current={section} onOpen={(id) => navigate(`/me/${id}`)} />,
				content:
					first && !section ? (
						<NotFoundPage />
					) : (
						<MeSectionPage
							section={section}
							page={second}
							onOpenPage={(page) => navigate(page ? `/me/${first}/${page}` : `/me/${first}`)}
							onModelDirtyChange={(dirty) => {
								modelDirty.current = dirty;
							}}
							onSignedOut={() => navigate("/sign-in", { replace: true })}
							onOpenLegal={(document) => navigate(`/${document}`)}
							appVersion={BUILD_VERSION}
							serverVersion={health.data?.version ?? null}
							renderChangePassword={(onDone) => (
								<PasswordSetupForm mode={hasPassword ? "change" : "set"} onDone={onDone} onSkip={onDone} />
							)}
						/>
					),
			};
		}

		switch (tab) {
			case "messages":
				return {
					list: <MessagesList current={first} onOpen={(id) => navigate(`/messages/${encodeURIComponent(id)}`)} />,
					content: (
						<ConversationPage conversationId={first ? (conversation?.id ?? null) : null} disconnected={disconnected} />
					),
				};
			case "tasks":
				return {
					list: (
						<TasksList
							scheduled={first === "scheduled"}
							onChange={(value) => navigate(value ? "/tasks/scheduled" : "/tasks")}
						/>
					),
					content: <TaskPage taskId={segmentRoot ? null : first} />,
				};
			case "memory":
				return {
					list: (
						<MemoryList files={first === "files"} onChange={(value) => navigate(value ? "/memory/files" : "/memory")} />
					),
					content: <MemoryPage />,
				};
		}
	}

	const talkingTo = tab === "messages" && conversation ? bot?.displayName : undefined;
	const composer = meOpen ? null : (
		<Composer
			recipientName={talkingTo ?? bot?.displayName ?? null}
			draft={draft}
			onDraftChange={setDraft}
			disabled={!conversation || history.isLoading || history.isError || send.isPending || disconnected}
			disconnected={disconnected}
			sendOnEnter={layoutMode !== "mobile"}
			streaming={Boolean(streaming)}
			onStop={() => {
				if (streaming) actions.stop.mutate(streaming.id);
			}}
			onSend={() => {
				const body = draft.trim();
				if (!conversation || !body) return;
				send.mutate({ type: "text", body, clientNonce: crypto.randomUUID() });
				setDraft("");
				if (tab !== "messages" || !first) navigate(`/messages/${MAIN_CONVERSATION}`);
			}}
		/>
	);
	const labels: Record<TabId, string> = {
		messages: t("nav.messages"),
		tasks: t("nav.tasks"),
		memory: t("nav.memory"),
	};

	return (
		<AppShell
			tab={{ current: tab, onSelect: (id) => navigate(tabPath(id)), labels, ariaLabel: t("nav.tabs") }}
			renderAvatar={(size) => <Avatar name={person?.displayName ?? "?"} src={person?.avatarUrl} size={size} />}
			personName={person?.displayName ?? ""}
			meLabel={t("nav.me")}
			onOpenMe={() => navigate("/me")}
			meOpen={meOpen}
			onBack={back}
			backLabel={t("app.back")}
			mobileShowList={meOpen ? !first : !detailOpen}
			list={list}
			content={content}
			detailOpen={detailOpen}
			composer={composer}
			titlebarInset={isMacDesktopShell()}
			brand={<Brand />}
			labels={{ showList: t("nav.showList"), hideList: t("nav.hideList"), resizeList: t("nav.resizeList") }}
			locationKey={segmentRoot ? tabPath(tab) : location.pathname}
			onModeChange={setLayoutMode}
		/>
	);
}

function Brand() {
	return <AppIcon size={32} title="Yonder" />;
}
