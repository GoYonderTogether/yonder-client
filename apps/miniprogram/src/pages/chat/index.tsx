import { Button as NativeButton, ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { conversationBotOwner, groupMessages, optionCardState } from "@yonder/chat-model";
import { ComposerFrame, ComposerLayout } from "@yonder/chat-presentation";
import type { SkillSummary } from "@yonder/protocol";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, go, Page, State } from "../../components/ui";
import { t, useLocale } from "../../lib/i18n";
import { api, useCachedBots } from "../../lib/runtime";
import { accountTimeZone } from "../../lib/time";
import { AgentTitle } from "./agent-title";
import { ChatAvatar } from "./avatar";
import { chatBotId } from "./bot-entry";
import { AttachMenu, PendingUploads, SkillPicker } from "./composer-extras";
import { ChatView } from "./host";
import { renderMessageBlock } from "./messages";
import { conversationTitle, directPartner } from "./model";
import { measureScrollAnchor, type ScrollAnchorMetrics } from "./scroll-anchor";
import { closureText } from "./sentences";
import { useChat } from "./use-chat";
import { useChatUploads } from "./use-uploads";
import { useChatViewport } from "./use-viewport";
import { useVisibleRead } from "./use-visible-read";
import { visitSentence } from "./visits";
import { VoiceInput } from "./voice";
import "./style.scss";

export default function Chat() {
	const id = useRouter().params.id ?? "";
	const { locale } = useLocale();
	const chat = useChat(id);
	const uploads = useChatUploads(chat.me?.member.id, id);
	const { contentHeight, keyboardVisible, onFocus, onBlur } = useChatViewport();
	const draftKey = `yonder.mini.draft.${chat.memberId ?? ""}.${id}`;
	const draftKeyRef = useRef(draftKey);
	draftKeyRef.current = draftKey;
	const [draft, setDraft] = useState(() => ({ scope: draftKey, value: String(Taro.getStorageSync(draftKey) || "") }));
	const text = draft.scope === draftKey ? draft.value : "";
	const updateText = (value: string | ((current: string) => string)) => {
		setDraft((current) => {
			const currentValue = current.scope === draftKey ? current.value : "";
			return { scope: draftKey, value: typeof value === "function" ? value(currentValue) : value };
		});
	};
	const [skills, setSkills] = useState<SkillSummary[]>([]);
	const [selected, setSelected] = useState<string[]>([]);
	const [showSkills, setShowSkills] = useState(false);
	const [showAttachMenu, setShowAttachMenu] = useState(false);
	const [uploadNotice, setUploadNotice] = useState("");
	const [follow, setFollow] = useState(true);
	const [anchor, setAnchor] = useState("");
	const pendingOlderAnchor = useRef<{
		messageId: string;
		before: ScrollAnchorMetrics | null;
		scope: string;
		ready: boolean;
		revision: number;
	} | null>(null);
	const [anchorRevision, setAnchorRevision] = useState(0);
	const [scrollTop, setScrollTop] = useState<number>();
	const sending = useRef(false);
	const lastScrollTop = useRef(0);
	const followRef = useRef(follow);
	followRef.current = follow;
	const followAfterLayout = useCallback(() => {
		if (!followRef.current) return;
		setScrollTop(undefined);
		setAnchor("");
		Taro.nextTick(() => setAnchor("message-end"));
	}, []);
	const reportEnd = useVisibleRead(
		id,
		chat.me?.member.id,
		chat.messages,
		follow && !chat.loading && Boolean(chat.conversation?.unreadCount),
	);
	const lastMessage = chat.messages.at(-1);
	const isGroup = chat.conversation?.kind === "group";
	// A closed group keeps its history and loses the composer; the reason is the server's.
	const closedReason = chat.conversation?.closedReason ?? null;
	// A chat with someone else's Bot: the owner reads it and decides, the visitor sees the ladder. A
	// host never writes, so the composer is gone; the title and the details sheet follow the visit,
	// because "the first member who is not me" is the wrong side in a three-member chat.
	const visit = chat.conversation?.visit ?? null;
	const visitor = visit
		? chat.conversation?.members.find((member) => member.kind === "person" && member.memberId !== chat.me?.member.id)
		: undefined;
	const visitLine = visit ? visitSentence(visit, visitor?.displayName ?? "", locale) : null;
	const watching = visit?.role === "host" || chat.conversation?.kind === "system";
	const partner = visit
		? visit.role === "host"
			? visitor
			: chat.conversation?.members.find((member) => member.memberId === visit.botId)
		: chat.conversation
			? directPartner(chat.conversation.members, chat.me?.member.id)
			: undefined;
	// In a one-to-one chat the settings action and the Bot's avatar open the Bot page this account owns
	// (15-Bot生命周期 四 ①); a visit is handled by the visit flow instead.
	const botId = chatBotId(chat.conversation);
	const openDetails = () => {
		if (!chat.conversation) return;
		if (isGroup) go(`/pages/group/index?id=${encodeURIComponent(chat.conversation.id)}`);
		else if (botId) go(`/pages/bot/index?id=${encodeURIComponent(botId)}&conversationId=${encodeURIComponent(id)}`);
		else if (partner)
			go(`/pages/member/index?handle=${encodeURIComponent(partner.handle)}&conversationId=${encodeURIComponent(id)}`);
	};
	const botMember = chat.conversation?.members.find((member) => member.kind === "bot");
	const agentPeer = !isGroup && partner?.kind === "bot" ? partner : undefined;
	// Every conversation shows both sides' avatars (the founder's 11-25 rule), the other side on the
	// left and the owner on the right, one face per run — the same rule the web chat follows.
	const showMessageAvatars = Boolean(chat.conversation);
	/**
	 * A long press on someone's avatar in a group puts `@name ` in the draft, the touch way to @ them
	 * (WeChat and QQ do the same on the avatar). Mentions are tracked here as text plus ids, because
	 * the mini program has no completion-binding layer; one whose words the reader deleted is dropped
	 * at send time instead of being sent as a stale id.
	 */
	const [mentions, setMentions] = useState<{ id: string; marker: string }[]>([]);
	const [focusWanted, setFocusWanted] = useState(false);
	const mention = (memberId: string, displayName: string) => {
		const marker = `@${displayName}`;
		updateText((current) => `${current}${current === "" || /\s$/u.test(current) ? "" : " "}${marker} `);
		setMentions((current) => [...current.filter((item) => item.id !== memberId), { id: memberId, marker }]);
		setFocusWanted(true);
	};
	/** The ids whose `@name` is still in the draft: a mention the reader edited away is not sent. */
	const liveMentions = () => mentions.filter(({ marker }) => text.includes(marker)).map(({ id }) => id);
	const title =
		(chat.conversation &&
			((visit ? partner?.displayName : undefined) ||
				(chat.conversation.kind === "system"
					? t("系统通知", "System notifications")
					: conversationTitle(chat.conversation.members, chat.me?.member.id, chat.conversation.title)))) ||
		t("聊天", "Chat");
	const zone = accountTimeZone();
	const blocks = useMemo(
		() => groupMessages(chat.messages, chat.hasFullHistory, { agentCards: true }, zone),
		[chat.messages, chat.hasFullHistory, zone],
	);
	const presentation = {
		showMessageAvatars,
		showSenderNames: isGroup,
		locale,
		zone,
		contacts: useCachedBots(),
		...(isGroup ? { onMention: mention } : {}),
	};
	const optionCards = optionCardState(chat.messages, chat.me?.member.id);
	const hasActiveRun = chat.messages.some(
		(message) =>
			message.senderKind === "bot" &&
			(message.streaming || message.run?.status === "queued" || message.run?.status === "running"),
	);
	const expanded = text.includes("\n") || uploads.uploads.length > 0 || showSkills;
	const layoutSignature = `${contentHeight}:${expanded}`;
	const canSend =
		!hasActiveRun &&
		Boolean(text.trim() || uploads.uploads.length) &&
		uploads.uploads.every((file) => file.attachment && !file.uploading);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a different conversation drops the pending older-page anchor, which is keyed by the draft scope.
	useEffect(() => {
		pendingOlderAnchor.current = null;
	}, [draftKey]);
	useEffect(() => {
		if (follow && lastMessage && layoutSignature) followAfterLayout();
	}, [lastMessage, layoutSignature, follow, followAfterLayout]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the ref holds the scope of the latest conversation, read inside the async callback.
	useEffect(() => {
		const pending = pendingOlderAnchor.current;
		if (!pending || pending.scope !== draftKey || !pending.ready || anchorRevision < pending.revision) return;
		const before = pending.before;
		if (!before || followRef.current || !chat.messages.some((message) => message.id === pending.messageId)) {
			pendingOlderAnchor.current = null;
			return;
		}
		setAnchor("");
		Taro.nextTick(() => {
			void measureScrollAnchor(pending.messageId).then((after) => {
				if (pendingOlderAnchor.current !== pending || draftKeyRef.current !== pending.scope) return;
				if (!after) {
					pendingOlderAnchor.current = null;
					return;
				}
				const delta = after.relativeY - before.relativeY;
				if (Math.abs(delta) > 1) setScrollTop(Math.max(0, after.scrollTop + delta));
				pendingOlderAnchor.current = null;
			});
		});
	}, [chat.messages, draftKey, anchorRevision]);
	const loadEarlier = async () => {
		if (chat.loading || !chat.cursor || chat.olderLoading || pendingOlderAnchor.current) return;
		setFollow(false);
		setAnchor("");
		setScrollTop(undefined);
		const messageId = chat.messages[0]?.id ?? "";
		const pending = {
			messageId,
			before: null as ScrollAnchorMetrics | null,
			scope: draftKey,
			ready: false,
			revision: anchorRevision + 1,
		};
		pendingOlderAnchor.current = pending;
		if (messageId) pending.before = await measureScrollAnchor(messageId);
		if (pendingOlderAnchor.current !== pending || draftKeyRef.current !== draftKey) return;
		const loaded = await chat.load(true);
		if (pendingOlderAnchor.current !== pending) return;
		if (!loaded) pendingOlderAnchor.current = null;
		else {
			pending.ready = true;
			setAnchorRevision(pending.revision);
		}
	};
	const send = async () => {
		if (
			sending.current ||
			chat.sending ||
			!canSend ||
			uploads.uploads.some((file) => !file.attachment || file.uploading)
		)
			return;
		sending.current = true;
		setFollow(true);
		setScrollTop(undefined);
		const scope = draftKey;
		const body = text;
		const files = uploads.uploads.flatMap((file) => (file.attachment ? [file.attachment] : []));
		const uploadKeys = uploads.uploads.filter((file) => file.attachment).map((file) => file.key);
		const skillIds = [...selected];
		const mentionedMemberIds = liveMentions();
		// The pending bubble is on screen before the request leaves, so the field empties with it rather
		// than after the round trip; when nothing was sent, the same text goes back.
		setDraft((current) => (current.scope === scope && current.value === body ? { ...current, value: "" } : current));
		try {
			const sent = await chat.send(body, files, skillIds, undefined, mentionedMemberIds);
			if (!sent) throw new Error("not_sent");
			if (scope === draftKeyRef.current) {
				uploads.clearSentUploads(uploadKeys);
				setMentions([]);
			}
		} catch {
			setDraft((current) => (current.scope === scope && !current.value ? { ...current, value: body } : current));
		} finally {
			sending.current = false;
		}
	};

	const openSkills = async () => {
		setShowSkills((current) => !current);
		setShowAttachMenu(false);
		if (!showSkills)
			try {
				setSkills((await api.skills()).items.filter((skill) => skill.enabled));
			} catch {
				// The composer keeps the current selection if the skills request is unavailable.
			}
	};

	const toggleSkill = (skill: SkillSummary) => {
		setSelected((current) =>
			current.includes(skill.id) ? current.filter((value) => value !== skill.id) : [...current, skill.id],
		);
	};

	return (
		<Page
			back
			chatLayout
			onMore={chat.conversation?.kind !== "system" && (isGroup || botId || partner?.handle) ? openDetails : undefined}
			title={agentPeer ? null : title}
		>
			<View
				className={`mini-chat ${keyboardVisible ? "mini-chat-keyboard-open" : ""}`}
				style={{ height: `${contentHeight}px` }}
			>
				{agentPeer ? (
					<AgentTitle
						key={agentPeer.memberId}
						bot={agentPeer}
						messages={chat.messages}
						owner={conversationBotOwner(agentPeer, chat.conversation)}
					/>
				) : null}
				{chat.loading || chat.error || uploads.error || uploadNotice || chat.closedError || chat.visitError ? (
					<View className="mini-chat-status">
						<State
							loading={chat.loading}
							error={chat.closedError || chat.visitError || chat.error || uploads.error || uploadNotice}
							retry={() => {
								setUploadNotice("");
								void chat.load();
							}}
						/>
					</View>
				) : null}
				{/* One factual line about the visit, with only the actions that state allows. */}
				{visitLine ? (
					<View className="mini-chat-visit">
						<Text className="mini-muted">{visitLine}</Text>
						<View className="mini-chat-visit-actions">
							{visit?.role === "host" && (visit.state === "pending" || visit.state === "capped") ? (
								<>
									<Button onClick={() => void chat.visitAction("approve")}>{t("批准继续", "Approve")}</Button>
									<Button onClick={() => void chat.visitAction("approve", true)}>
										{t("批准并由我支付", "Approve and pay")}
									</Button>
									<Button secondary onClick={() => void chat.visitAction("deny")}>
										{t("拒绝", "Decline")}
									</Button>
								</>
							) : null}
							{visit?.role === "visitor" && visit.state === "capped" ? (
								<Button
									onClick={() =>
										void Taro.showModal({
											title: t("确认使用我的额度", "Confirm payment"),
											content: t("继续聊天将使用你的主额度。", "Continuing will use your main quota."),
										}).then((result) => {
											if (result.confirm) void chat.visitAction("pay");
										})
									}
								>
									{t("后续由我支付", "Pay for the rest myself")}
								</Button>
							) : null}
						</View>
					</View>
				) : null}
				<ScrollView
					className="mini-message-list"
					scrollY
					scrollIntoView={anchor}
					{...(scrollTop === undefined ? {} : { scrollTop })}
					scrollWithAnimation={false}
					upperThreshold={2}
					lowerThreshold={2}
					onTouchMove={() => setFollow(false)}
					onScroll={(event) => {
						const scrollTop = event.detail.scrollTop;
						if (scrollTop < lastScrollTop.current) setFollow(false);
						lastScrollTop.current = scrollTop;
					}}
					onScrollToUpper={() => {
						if (!chat.olderError) void loadEarlier();
					}}
					onScrollToLower={() => {
						setScrollTop(undefined);
						setFollow(true);
						reportEnd();
					}}
				>
					{chat.cursor ? (
						<View className="mini-chat-older">
							{chat.olderLoading ? (
								<View
									className="mini-chat-spinner"
									ariaRole="status"
									ariaLabel={t("正在加载更早的消息…", "Loading earlier messages…")}
								/>
							) : chat.olderError ? (
								<Button secondary onClick={() => void loadEarlier()}>
									{t("重试加载更早的消息", "Retry loading earlier messages")}
								</Button>
							) : null}
						</View>
					) : null}
					{blocks.map((block) => renderMessageBlock(block, chat, presentation, followAfterLayout, optionCards))}
					{!chat.loading && !chat.error && chat.messages.length === 0 ? (
						<View className="mini-chat-empty">
							{agentPeer ? null : (
								<View className="mini-chat-empty-icon">
									<ChatAvatar
										name={botMember?.displayName || "Yonder"}
										kind="bot"
										src={botMember?.avatarUrl}
										size={40}
									/>
								</View>
							)}
							<Text>{t("还没有消息", "No messages yet")}</Text>
						</View>
					) : null}
					<View id="message-end" />
				</ScrollView>
				{!follow ? (
					<View className="mini-chat-latest">
						<NativeButton
							className="mini-chat-latest-button"
							ariaLabel={t("回到最新消息", "Latest messages")}
							onClick={() => setFollow(true)}
						>
							↓
						</NativeButton>
					</View>
				) : null}
				{closedReason ? (
					<View className="mini-chat-closed">
						<Text className="mini-muted">{closureText(closedReason)}</Text>
					</View>
				) : watching ? null : (
					<ComposerFrame as={ChatView}>
						<PendingUploads uploads={uploads} />
						{showSkills ? <SkillPicker skills={skills} selected={selected} onToggle={toggleSkill} /> : null}
						<ComposerLayout as={ChatView} expanded={expanded}>
							<View className="composer-add">
								<NativeButton
									className="composer-tool mini-chat-icon-button"
									ariaLabel={t("添加附件", "Add attachment")}
									onClick={() => {
										setShowAttachMenu((current) => !current);
										setShowSkills(false);
									}}
								>
									<Text className="mini-chat-plus-icon">+</Text>
								</NativeButton>
								<AttachMenu
									open={showAttachMenu}
									skillCount={selected.length}
									onImages={() => {
										setShowAttachMenu(false);
										uploads.addImages();
									}}
									onFiles={() => {
										setShowAttachMenu(false);
										uploads.addFiles();
									}}
									onSkills={() => void openSkills()}
								/>
							</View>
							<View className="composer-editor">
								<Textarea
									className="composer-text-style mini-chat-input"
									value={text}
									maxlength={-1}
									autoHeight
									adjustPosition={false}
									fixed
									disableDefaultPadding
									cursorSpacing={24}
									placeholder={t("对话…", "Message…")}
									{...(focusWanted ? { focus: true, selectionStart: text.length, selectionEnd: text.length } : {})}
									onFocus={() => {
										onFocus();
										if (focusWanted) setFocusWanted(false);
									}}
									onBlur={onBlur}
									onInput={(event) => updateText(event.detail.value)}
								/>
							</View>
							<VoiceInput
								compact
								onText={(value) => updateText((current) => current + value)}
								onError={(value) => setUploadNotice(value)}
							/>
							<NativeButton
								className="composer-send mini-chat-send"
								ariaLabel={t("发送", "Send")}
								disabled={!canSend || chat.sending ? true : undefined}
								onClick={() => void send()}
							>
								<Text className="mini-chat-send-icon">↑</Text>
							</NativeButton>
						</ComposerLayout>
					</ComposerFrame>
				)}
			</View>
		</Page>
	);
}
