import { Checkbox, Image, ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import type { Attachment, SkillSummary } from "@yonder/protocol";
import { useEffect, useRef, useState } from "react";
import { Button, Page, State } from "../../components/ui";
import { t } from "../../lib/i18n";
import { api, client, newNonce, uploadAttachment, useSession } from "../../lib/runtime";
import { MessageAttachment } from "./attachment";
import { MessageBody } from "./markdown";
import { conversationTitle } from "./model";
import { useChat } from "./use-chat";
import { VoiceInput } from "./voice";
import "./style.scss";

type Upload = { key: string; path: string; name: string; attachment?: Attachment; error?: string };
export default function Chat() {
	const id = useRouter().params.id ?? "";
	const chat = useChat(id);
	const { me } = useSession();
	const draftKey = `yonder.mini.draft.${me?.member.id ?? ""}.${id}`;
	const [text, setText] = useState(() => String(Taro.getStorageSync(draftKey) || ""));
	const [uploads, setUploads] = useState<Upload[]>([]);
	const [skills, setSkills] = useState<SkillSummary[]>([]);
	const [selected, setSelected] = useState<string[]>([]);
	const [showSkills, setShowSkills] = useState(false);
	const [follow, setFollow] = useState(true);
	const [anchor, setAnchor] = useState("");
	const [error, setError] = useState("");
	const sending = useRef(false);
	const lastMessage = chat.messages.slice(-1)[0];
	useEffect(() => {
		if (me) Taro.setStorageSync(draftKey, text);
	}, [text, draftKey, me]);
	useEffect(() => {
		if (follow && lastMessage) {
			setAnchor("");
			Taro.nextTick(() => setAnchor("message-end"));
		}
	}, [lastMessage, follow]);
	const upload = async (file: Upload) => {
		setUploads((current) => current.map((item) => (item.key === file.key ? { ...item, error: undefined } : item)));
		try {
			const attachment = await uploadAttachment(file.path, file.key);
			setUploads((current) =>
				current.map((item) => (item.key === file.key ? { ...item, attachment, error: undefined } : item)),
			);
		} catch (e) {
			setUploads((current) =>
				current.map((item) =>
					item.key === file.key ? { ...item, error: e instanceof Error ? e.message : String(e) } : item,
				),
			);
		}
	};
	const addFiles = async (image: boolean) => {
		try {
			setError("");
			const remaining = 9 - uploads.length;
			if (remaining <= 0) return;
			const paths = image
				? (
						await Taro.chooseMedia({ count: remaining, mediaType: ["image"], sourceType: ["album", "camera"] })
					).tempFiles.map((file) => ({
						path: file.tempFilePath,
						name: file.tempFilePath.split("/").slice(-1)[0] ?? t("图片", "Image"),
					}))
				: (await Taro.chooseMessageFile({ count: remaining, type: "file" })).tempFiles.map((file) => ({
						path: file.path,
						name: file.name,
					}));
			const files = paths.map((file) => ({
				...file,
				key: newNonce(),
			}));
			setUploads((current) => [...current, ...files]);
			for (const file of files) void upload(file);
		} catch (e) {
			if (!(e as { errMsg?: string })?.errMsg?.includes("cancel")) setError(e instanceof Error ? e.message : String(e));
		}
	};
	const send = async () => {
		if (sending.current || (!text.trim() && !uploads.length) || uploads.some((file) => !file.attachment)) return;
		sending.current = true;
		setFollow(true);
		const body = text;
		const files = uploads.flatMap((file) => (file.attachment ? [file.attachment] : []));
		const skillIds = [...selected];
		setText("");
		setUploads([]);
		try {
			await chat.send(body, files, skillIds);
		} finally {
			sending.current = false;
		}
	};
	const openSkills = async () => {
		setShowSkills(!showSkills);
		if (!showSkills)
			try {
				setSkills((await api.skills()).items.filter((skill) => skill.enabled));
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
	};
	return (
		<Page
			back
			title={
				chat.conversation
					? conversationTitle(chat.conversation.members, me?.member.id, chat.conversation.title) || t("聊天", "Chat")
					: t("聊天", "Chat")
			}
		>
			<View className="mini-chat">
				<State loading={chat.loading} error={chat.error || error} retry={() => void chat.load()} />
				<ScrollView
					className="mini-message-list"
					scrollY
					scrollIntoView={anchor}
					scrollWithAnimation={false}
					onTouchMove={() => setFollow(false)}
					onScrollToLower={() => setFollow(true)}
				>
					{chat.cursor && (
						<Button
							secondary
							onClick={() => {
								setFollow(false);
								void chat.load(true);
							}}
						>
							{t("加载更早消息", "Load earlier messages")}
						</Button>
					)}
					{chat.messages.map((message) => {
						const sender = chat.conversation?.members.find((member) => member.memberId === message.senderId);
						const avatarUrl = sender?.avatarUrl;
						return (
							<View
								key={message.id}
								id={`message-${message.id}`}
								className={`mini-message ${message.senderId === me?.member.id ? "mini-message-own" : ""}`}
							>
								<View className="mini-message-head">
									{avatarUrl ? (
										<Image
											className="mini-message-avatar"
											src={avatarUrl.startsWith("/") ? `${client.baseUrl}${avatarUrl}` : avatarUrl}
										/>
									) : (
										<View className="mini-message-avatar">{(sender?.displayName ?? "Y").slice(0, 1)}</View>
									)}
									<Text className="muted mini-sender">
										{sender?.displayName ??
											(message.senderId === me?.member.id
												? me?.member.displayName
												: message.senderKind === "bot"
													? "Bot"
													: t("成员", "Member"))}
									</Text>
								</View>
								<View className="mini-bubble">
									<MessageBody body={message.body ?? ""} />
									{message.attachments?.map((file) => (
										<MessageAttachment key={file.id} file={file} />
									))}
								</View>
								{message.pending && <Text className="muted">{t("发送中…", "Sending…")}</Text>}
								{message.sendFailed && (
									<Button secondary onClick={() => void chat.action(message)}>
										{t("发送失败，重试", "Send failed · Retry")}
									</Button>
								)}
								{message.senderKind === "bot" &&
									(message.streaming || message.run?.status === "queued" || message.run?.status === "running") && (
										<Button secondary onClick={() => void chat.action(message)}>
											{t("停止生成", "Stop generating")}
										</Button>
									)}
								{message.senderKind === "bot" && message.run?.status === "failed" && (
									<View>
										<Text className="mini-error">
											{message.run.failureReason || t("生成失败", "Generation failed")}
										</Text>
										<Button secondary onClick={() => void chat.action(message)}>
											{t("重试", "Retry")}
										</Button>
									</View>
								)}
							</View>
						);
					})}
					<View id="message-end" />
				</ScrollView>
				{!follow && (
					<Button
						secondary
						onClick={() => {
							setFollow(true);
							setAnchor("");
							Taro.nextTick(() => setAnchor("message-end"));
						}}
					>
						{t("回到最新消息", "Latest messages")}
					</Button>
				)}
				<View className="mini-composer card stack">
					{uploads.length > 0 && (
						<View className="mini-upload-list">
							{uploads.map((file) => (
								<View className="mini-upload" key={file.key}>
									{/\.(png|jpe?g|webp|gif)$/i.test(file.path) && (
										<Image className="mini-upload-image" src={file.path} mode="aspectFill" />
									)}
									<Text>{file.name}</Text>
									{file.error ? (
										<Text className="mini-error" onClick={() => void upload(file)}>
											{t("上传失败，点击重试", "Upload failed · Retry")}
										</Text>
									) : (
										<Text className="muted">
											{file.attachment ? t("已上传", "Uploaded") : t("上传中…", "Uploading…")}
										</Text>
									)}
									<Text
										className="mini-link"
										onClick={() => setUploads((current) => current.filter((item) => item.key !== file.key))}
									>
										{t("移除", "Remove")}
									</Text>
								</View>
							))}
						</View>
					)}
					{showSkills && (
						<View className="stack">
							{!skills.length && <Text className="muted">{t("暂无已启用技能", "No enabled skills")}</Text>}
							{skills.map((skill) => (
								<View
									className="row"
									key={skill.id}
									onClick={() =>
										setSelected((current) =>
											current.includes(skill.id)
												? current.filter((value) => value !== skill.id)
												: [...current, skill.id],
										)
									}
								>
									<Checkbox value={skill.id} checked={selected.includes(skill.id)} />
									<Text>{skill.name}</Text>
								</View>
							))}
						</View>
					)}
					<Textarea
						className="mini-chat-input"
						value={text}
						onInput={(event) => setText(event.detail.value)}
						maxlength={-1}
						autoHeight
						adjustPosition
						cursorSpacing={24}
						placeholder={t("发消息…", "Message…")}
					/>
					<View className="actions">
						<VoiceInput onText={(value) => setText((current) => current + value)} onError={setError} />
						<Button secondary disabled={uploads.length >= 9} onClick={() => void addFiles(true)}>
							{t("图片", "Image")}
						</Button>
						<Button secondary disabled={uploads.length >= 9} onClick={() => void addFiles(false)}>
							{t("文件", "File")}
						</Button>
						<Button secondary onClick={() => void openSkills()}>
							{t("技能", "Skills")}
							{selected.length ? ` ${selected.length}` : ""}
						</Button>
						<Button
							loading={chat.sending}
							disabled={(!text.trim() && !uploads.length) || uploads.some((file) => !file.attachment)}
							onClick={() => void send()}
						>
							{t("发送", "Send")}
						</Button>
					</View>
				</View>
			</View>
		</Page>
	);
}
