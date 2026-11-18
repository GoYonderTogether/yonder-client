import { Checkbox, Image, Button as NativeButton, ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { groupMessages, isTwoPartyAgentChat } from "@yonder/chat-model";
import { ComposerFrame, ComposerLayout, UploadTile } from "@yonder/chat-presentation";
import type { SkillSummary } from "@yonder/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, go, Page, State } from "../../components/ui";
import { t, useLocale } from "../../lib/i18n";
import { api } from "../../lib/runtime";
import { AgentTitle } from "./agent-title";
import { ChatAvatar } from "./avatar";
import { chatBotId } from "./bot-entry";
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
	const draftKey = `yonder.mini.draft.${chat.me?.member.id ?? ""}.${id}`;
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
		before: ScrollAnchorMetrics;
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
	useVisibleRead(id, chat.me?.member.id, chat.messages, follow && Boolean(chat.conversation?.unreadCount));
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
	const watching = visit?.role === "host";
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
	const showMessageAvatars = !chat.conversation || !isTwoPartyAgentChat(chat.conversation, chat.me?.member.id);
	const title =
		(chat.conversation &&
			((visit ? partner?.displayName : undefined) ||
				conversationTitle(chat.conversation.members, chat.me?.member.id, chat.conversation.title))) ||
		t("聊天", "Chat");
	const blocks = useMemo(() => groupMessages(chat.messages), [chat.messages]);
	const presentation = { showMessageAvatars, showSenderNames: isGroup, locale };
	const openOptions = chat.messages
		.slice()
		.reverse()
		.find((message) => message.options?.length || (message.senderId === chat.me?.member.id && !message.sendFailed))?.id;
	const activeRun = [...chat.messages]
		.reverse()
		.find(
			(message) =>
				message.senderKind === "bot" &&
				(message.streaming || message.run?.status === "queued" || message.run?.status === "running"),
		);
	const expanded = text.includes("\n") || uploads.uploads.length > 0 || showSkills;
	const layoutSignature = `${contentHeight}:${expanded}`;
	const canSend =
		Boolean(text.trim() || uploads.uploads.length) &&
		uploads.uploads.every((file) => file.attachment && !file.uploading);

	useEffect(() => {
		pendingOlderAnchor.current = null;
		setDraft({ scope: draftKey, value: String(Taro.getStorageSync(draftKey) || "") });
	}, [draftKey]);
	useEffect(() => {
		if (chat.me && draft.scope === draftKey) Taro.setStorageSync(draftKey, draft.value);
	}, [draft, draftKey, chat.me]);
	useEffect(() => {
		if (follow && lastMessage) {
			setScrollTop(undefined);
			setAnchor("");
			Taro.nextTick(() => setAnchor("message-end"));
		}
	}, [lastMessage, follow]);
	useEffect(() => {
		if (follow && layoutSignature) {
			setScrollTop(undefined);
			setAnchor("");
			Taro.nextTick(() => setAnchor("message-end"));
		}
	}, [layoutSignature, follow]);
	useEffect(() => {
		const pending = pendingOlderAnchor.current;
		if (!pending || pending.scope !== draftKey || !pending.ready || anchorRevision < pending.revision) return;
		if (!chat.messages.some((message) => message.id === pending.messageId)) {
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
				const delta = after.relativeY - pending.before.relativeY;
				if (Math.abs(delta) > 1) setScrollTop(Math.max(0, after.scrollTop + delta));
				pendingOlderAnchor.current = null;
			});
		});
	}, [chat.messages, draftKey, anchorRevision]);
	const followAfterLayout = () => {
		if (!followRef.current) return;
		setScrollTop(undefined);
		setAnchor("");
		Taro.nextTick(() => setAnchor("message-end"));
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
		try {
			const result = await chat.send(body, files, skillIds);
			if (result !== undefined && scope === draftKeyRef.current) {
				uploads.clearSentUploads(uploadKeys);
				setDraft((current) =>
					current.scope === scope && current.value === body ? { ...current, value: "" } : current,
				);
			}
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
			onMore={isGroup || botId || partner?.handle ? openDetails : undefined}
			title={agentPeer ? null : title}
		>
			<View
				className={`mini-chat ${keyboardVisible ? "mini-chat-keyboard-open" : ""}`}
				style={{ height: `${contentHeight}px` }}
			>
				{agentPeer ? <AgentTitle bot={agentPeer} messages={chat.messages} /> : null}
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
					onTouchMove={() => setFollow(false)}
					onScroll={(event) => {
						const scrollTop = event.detail.scrollTop;
						if (scrollTop < lastScrollTop.current) setFollow(false);
						lastScrollTop.current = scrollTop;
					}}
					onScrollToLower={() => {
						setScrollTop(undefined);
						setFollow(true);
					}}
				>
					{chat.cursor ? (
						<View className="mini-chat-older">
							<Button
								secondary
								disabled={chat.olderLoading}
								onClick={() => {
									const firstId = chat.messages[0]?.id;
									setFollow(false);
									setAnchor("");
									if (!firstId || chat.olderLoading || pendingOlderAnchor.current) return;
									void measureScrollAnchor(firstId).then((before) => {
										if (!before || draftKeyRef.current !== draftKey || pendingOlderAnchor.current) return;
										const pending = {
											messageId: firstId,
											before,
											scope: draftKey,
											ready: false,
											revision: anchorRevision + 1,
										};
										pendingOlderAnchor.current = pending;
										void chat.load(true).then((loaded) => {
											if (pendingOlderAnchor.current !== pending) return;
											if (!loaded) pendingOlderAnchor.current = null;
											else {
												pending.ready = true;
												setAnchorRevision(pending.revision);
											}
										});
									});
								}}
							>
								{chat.olderLoading ? t("正在加载…", "Loading…") : t("加载更早消息", "Load earlier messages")}
							</Button>
						</View>
					) : null}
					{blocks.map((block) => renderMessageBlock(block, chat, presentation, followAfterLayout, openOptions))}
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
						<Button
							secondary
							onClick={() => {
								setFollow(true);
								setScrollTop(undefined);
								setAnchor("");
								Taro.nextTick(() => setAnchor("message-end"));
							}}
						>
							{t("回到最新消息", "Latest messages")}
						</Button>
					</View>
				) : null}
				{closedReason ? (
					<View className="mini-chat-closed">
						<Text className="mini-muted">{closureText(closedReason)}</Text>
					</View>
				) : watching ? null : (
					<ComposerFrame as={ChatView}>
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
										{file.error ? (
											<NativeButton
												className="composer-file-state mini-chat-upload-retry"
												ariaLabel={t("上传失败，重试", "Upload failed, retry")}
												onClick={() => uploads.retryUpload(file.key)}
											>
												{t("上传失败 · 重试", "Upload failed · Retry")}
											</NativeButton>
										) : (
											<View className={`composer-file-state ${file.uploading ? "mini-chat-uploading" : ""}`}>
												{file.uploading ? t("上传中…", "Uploading…") : t("已上传", "Uploaded")}
											</View>
										)}
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
								className={`composer-send mini-chat-send ${activeRun ? "mini-chat-send-stop" : ""}`}
								ariaLabel={activeRun ? t("停止生成", "Stop generating") : t("发送", "Send")}
								disabled={!activeRun && (!canSend || chat.sending) ? true : undefined}
								onClick={() => {
									if (activeRun) void chat.action(activeRun);
									else void send();
								}}
							>
								<Text className={activeRun ? "mini-chat-stop-icon" : "mini-chat-send-icon"}>
									{activeRun ? "" : "↑"}
								</Text>
							</NativeButton>
						</ComposerLayout>
					</ComposerFrame>
				)}
			</View>
		</Page>
	);
}
