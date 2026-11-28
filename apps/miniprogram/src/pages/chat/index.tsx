import { Checkbox, Image, Button as NativeButton, ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { conversationBotOwner, groupMessages, isTwoPartyAgentChat, optionCardState } from "@yonder/chat-model";
import { ComposerFrame, ComposerLayout, UploadTile } from "@yonder/chat-presentation";
import type { SkillSummary } from "@yonder/protocol";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, go, Page, State } from "../../components/ui";
import { t, useLocale } from "../../lib/i18n";
import { api, useCachedBots } from "../../lib/runtime";
import { AgentTitle } from "./agent-title";
import { ChatAvatar } from "./avatar";
import { chatBotId } from "./bot-entry";
import { ChatView } from "./host";
import { renderMessageBlock } from "./messages";
import { chatPartner, conversationTitle } from "./model";
import { measureScrollAnchor, type ScrollAnchorMetrics } from "./scroll-anchor";
import { closureText } from "./sentences";
import { useChat } from "./use-chat";
import { useChatUploads } from "./use-uploads";
import { useChatViewport } from "./use-viewport";
import { useVisibleRead } from "./use-visible-read";
import { VisitRelay } from "./visit-relay";
import { visitSentence } from "./visits";
import { VoiceInput } from "./voice";
import "./style.scss";

export default function Chat() {
	const id = useRouter().params.id ?? "";
	const { locale } = useLocale();
	const chat = useChat(id);
	const uploads = useChatUploads(chat.memberId ?? undefined, id);
	const { contentHeight, keyboardVisible, onFocus, onBlur } = useChatViewport();
	const draftKey = `yonder.mini.draft.${chat.memberId ?? ""}.${id}`;
	const draftKeyRef = useRef(draftKey);
	draftKeyRef.current = draftKey;
	const [draft, setDraft] = useState(() => ({
		scope: draftKey,
		value: String(Taro.getStorageSync(draftKey) || ""),
	}));
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
	const watching = visit?.role === "host" || chat.conversation?.kind === "system";
	const partner = chat.conversation && chatPartner(chat.conversation, chat.me?.member.id);
	const visitLine = visit ? visitSentence(visit, partner?.displayName ?? "", locale) : null;
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
	const showMessageAvatars = !chat.conversation || !isTwoPartyAgentChat(chat.conversation, chat.me?.member.id);
	const title =
		(chat.conversation &&
			((visit ? partner?.displayName : undefined) ||
				(chat.conversation.kind === "system"
					? t("系统通知", "System notifications")
					: conversationTitle(chat.conversation.members, chat.me?.member.id, chat.conversation.title)))) ||
		t("聊天", "Chat");
	const blocks = useMemo(
		() => groupMessages(chat.messages, chat.hasFullHistory, { agentCards: true }),
		[chat.messages, chat.hasFullHistory],
	);
	const presentation = { showMessageAvatars, showSenderNames: isGroup, locale, contacts: useCachedBots() };
	const optionCards = optionCardState(chat.messages, chat.me?.member.id);
	const expanded = text.includes("\n") || uploads.uploads.length > 0 || showSkills;
	const layoutSignature = `${contentHeight}:${expanded}`;
	const canSend = Boolean(text.trim() || uploads.uploads.length);
	const submitted = useRef<{ draft: typeof draft; files: typeof uploads.uploads }>();

	useEffect(() => {
		pendingOlderAnchor.current = null;
		setDraft({ scope: draftKey, value: String(Taro.getStorageSync(draftKey) || "") });
	}, [draftKey]);
	useEffect(() => {
		if (chat.memberId && draft.scope === draftKey) Taro.setStorageSync(draftKey, draft.value);
	}, [draft, draftKey, chat.memberId]);
	useEffect(() => {
		if (follow && lastMessage && layoutSignature) followAfterLayout();
	}, [lastMessage, layoutSignature, follow, followAfterLayout]);
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
	const send = () => {
		const files = uploads.uploads;
		if (!canSend || (submitted.current?.draft === draft && submitted.current.files === files)) return;
		if (!chat.send(text, files, [...selected])) return;
		submitted.current = { draft, files };
		setFollow(true);
		setScrollTop(undefined);
		uploads.clearSentUploads(files.map(({ key }) => key));
		setDraft((current) => (current === draft ? { ...current, value: "" } : current));
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
						{visit?.role === "visitor" && visit.state !== "denied" ? <VisitRelay key={id} chat={chat} /> : null}
						{uploads.uploads.length ? (
							<View className="composer-files">
								{uploads.uploads.map((file) => (
									<UploadTile key={file.key} as={ChatView} name={file.name} kind={file.kind}>
										<View className="composer-file-preview">
											{file.kind === "image" ? (
												<Image className="composer-file-image" src={file.path} mode="aspectFill" />
											) : (
												<Text className="mini-chat-file-icon">
													{file.name.split(".").at(-1)?.toUpperCase() || "FILE"}
												</Text>
											)}
											<View className="composer-file-name">
												<Text>{file.name}</Text>
											</View>
										</View>
										<NativeButton
											className="composer-file-remove mini-chat-icon-button"
											ariaLabel={t("移除文件", "Remove file")}
											onClick={() => uploads.removeUpload(file.key)}
										>
											<Text>×</Text>
										</NativeButton>
									</UploadTile>
								))}
							</View>
						) : null}
						{showSkills ? (
							<View className="mini-chat-skills">
								{!skills.length ? <Text className="mini-muted">{t("暂无已启用技能", "No enabled skills")}</Text> : null}
								{skills.map((skill) => (
									<View className="mini-chat-skill" key={skill.id} onClick={() => toggleSkill(skill)}>
										<Checkbox value={skill.id} checked={selected.includes(skill.id)} />
										<Text>{skill.name}</Text>
									</View>
								))}
							</View>
						) : null}
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
								{showAttachMenu ? (
									<View className="composer-add-menu mini-chat-add-menu">
										<NativeButton
											ariaLabel={t("上传图片", "Upload images")}
											onClick={() => {
												setShowAttachMenu(false);
												uploads.addImages();
											}}
										>
											{t("图片", "Image")}
										</NativeButton>
										<NativeButton
											ariaLabel={t("上传文件", "Upload files")}
											onClick={() => {
												setShowAttachMenu(false);
												uploads.addFiles();
											}}
										>
											{t("文件", "File")}
										</NativeButton>
										<NativeButton ariaLabel={t("技能", "Skills")} onClick={() => void openSkills()}>
											{selected.length ? `${t("技能", "Skills")} · ${selected.length}` : t("技能", "Skills")}
										</NativeButton>
									</View>
								) : null}
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
									onFocus={onFocus}
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
								disabled={!canSend || undefined}
								onClick={send}
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
