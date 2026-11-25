import { Checkbox, Image, Button as NativeButton, Text, View } from "@tarojs/components";
import { UploadTile } from "@yonder/chat-presentation";
import type { SkillSummary } from "@yonder/protocol";
import { t } from "../../lib/i18n";
import { ChatView } from "./host";
import type { useChatUploads } from "./use-uploads";

/**
 * The pieces above and inside the mini program's composer that only show when there is something to
 * show: the files waiting to be sent, the enabled skills, and the 「+」 menu. They are separate from
 * the page so the page stays a page — the chat's own state still decides what is drawn.
 */
export function PendingUploads({ uploads }: { uploads: ReturnType<typeof useChatUploads> }) {
	if (!uploads.uploads.length) return null;
	return (
		<View className="composer-files">
			{uploads.uploads.map((file) => (
				<UploadTile key={file.key} as={ChatView} name={file.name} kind={file.kind}>
					<View className="composer-file-preview">
						{file.kind === "image" ? (
							<Image className="composer-file-image" src={file.path} mode="aspectFill" />
						) : (
							<Text className="mini-chat-file-icon">{file.name.split(".").at(-1)?.toUpperCase() || "FILE"}</Text>
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
	);
}

/** The skills the account has on, as a picker in the composer; the selection goes out with the message. */
export function SkillPicker({
	skills,
	selected,
	onToggle,
}: {
	skills: readonly SkillSummary[];
	selected: readonly string[];
	onToggle: (skill: SkillSummary) => void;
}) {
	return (
		<View className="mini-chat-skills">
			{!skills.length ? <Text className="mini-muted">{t("暂无已启用技能", "No enabled skills")}</Text> : null}
			{skills.map((skill) => (
				<View className="mini-chat-skill" key={skill.id} onClick={() => onToggle(skill)}>
					<Checkbox value={skill.id} checked={selected.includes(skill.id)} />
					<Text>{skill.name}</Text>
				</View>
			))}
		</View>
	);
}

/** The 「+」 menu: images, files and skills, the three things this composer can attach. */
export function AttachMenu({
	open,
	skillCount,
	onImages,
	onFiles,
	onSkills,
}: {
	open: boolean;
	skillCount: number;
	onImages: () => void;
	onFiles: () => void;
	onSkills: () => void;
}) {
	if (!open) return null;
	return (
		<View className="composer-add-menu mini-chat-add-menu">
			<NativeButton ariaLabel={t("上传图片", "Upload images")} onClick={onImages}>
				{t("图片", "Image")}
			</NativeButton>
			<NativeButton ariaLabel={t("上传文件", "Upload files")} onClick={onFiles}>
				{t("文件", "File")}
			</NativeButton>
			<NativeButton ariaLabel={t("技能", "Skills")} onClick={onSkills}>
				{skillCount ? `${t("技能", "Skills")} · ${skillCount}` : t("技能", "Skills")}
			</NativeButton>
		</View>
	);
}
