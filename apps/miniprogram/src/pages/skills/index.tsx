import { Switch, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { SkillSummary } from "@yonder/protocol";
import { useState } from "react";
import { action, Button, Field, Page, State } from "../../components/ui";
import { useResource } from "../../components/use-resource";
import { t } from "../../lib/i18n";
import { api } from "../../lib/runtime";

export default function Skills() {
	const { data, loading, error, reload } = useResource(() => api.skills());
	const [selected, setSelected] = useState<SkillSummary | null>(null);
	const [file, setFile] = useState("");
	const [content, setContent] = useState("");
	const [creating, setCreating] = useState(false);
	return (
		<Page title={t("技能", "Skills")}>
			<State
				loading={loading}
				error={error}
				retry={() => void reload()}
				empty={!data?.items.length ? t("还没有技能", "No skills yet") : undefined}
			/>
			{data?.items.map((skill) => (
				<View className="mini-card" key={skill.id}>
					<View className="mini-row">
						<Text className="mini-subtitle">{skill.name}</Text>
						<Switch
							checked={skill.enabled}
							onChange={(event) =>
								void action(async () => {
									await api.updateSkill(skill.id, { enabled: event.detail.value });
									await reload();
								})
							}
						/>
					</View>
					<Text className="mini-muted">{skill.description}</Text>
					<Button
						secondary
						onClick={() =>
							void action(async () => {
								const path = skill.files.includes("SKILL.md") ? "SKILL.md" : skill.files[0];
								if (!path) return;
								const result = await api.skillFile(skill.id, path);
								setSelected(skill);
								setFile(path);
								setContent(result.content);
								setCreating(false);
							})
						}
					>
						{t("查看文件", "View files")}
					</Button>
					{skill.canEdit && (
						<Button
							danger
							onClick={() =>
								void action(async () => {
									const result = await Taro.showModal({
										title: t("删除技能？", "Delete skill?"),
										confirmText: t("删除", "Delete"),
										cancelText: t("取消", "Cancel"),
									});
									if (result.confirm) {
										await api.deleteSkill(skill.id);
										if (selected?.id === skill.id) setSelected(null);
										await reload();
									}
								})
							}
						>
							{t("删除", "Delete")}
						</Button>
					)}
				</View>
			))}
			<Button
				secondary
				onClick={() => {
					setSelected(null);
					setCreating(true);
					setFile("SKILL.md");
					setContent("");
				}}
			>
				{t("导入技能文本", "Import skill text")}
			</Button>
			<Button
				secondary
				onClick={() =>
					void action(async () => {
						const result = await Taro.chooseMessageFile({ count: 1, type: "file", extension: ["md", "txt"] });
						const imported = await new Promise<string>((resolve, reject) => {
							Taro.getFileSystemManager().readFile({
								filePath: result.tempFiles[0].path,
								encoding: "utf8",
								success: (res) => resolve(String(res.data)),
								fail: reject,
							});
						});
						setCreating(true);
						setSelected(null);
						setFile("SKILL.md");
						setContent(imported);
					})
				}
			>
				{t("从微信文件导入", "Import from WeChat file")}
			</Button>
			{(selected || creating) && (
				<View className="mini-card">
					{selected?.files.map((path) => (
						<Button
							key={path}
							secondary
							onClick={() =>
								void action(async () => {
									setFile(path);
									setContent((await api.skillFile(selected.id, path)).content);
								})
							}
						>
							{path}
						</Button>
					))}
					<Field label={t("文件路径", "File path")} value={file} onInput={setFile} />
					<Textarea
						className="mini-input mini-pre"
						value={content}
						maxlength={-1}
						disabled={Boolean(selected && !selected.canEdit)}
						autoHeight
						onInput={(event) => setContent(event.detail.value)}
					/>
					{(creating || selected?.canEdit) && (
						<Button
							disabled={!content.trim() || !file.trim()}
							onClick={() =>
								void action(async () => {
									if (creating) await api.createSkill({ files: { [file]: content } });
									else if (selected) {
										const files: Record<string, string> = {};
										for (const path of selected.files)
											files[path] = path === file ? content : (await api.skillFile(selected.id, path)).content;
										files[file] = content;
										await api.updateSkill(selected.id, { files });
									}
									setCreating(false);
									setSelected(null);
									await reload();
								})
							}
						>
							{t("保存", "Save")}
						</Button>
					)}
					<Button
						secondary
						onClick={() => {
							setCreating(false);
							setSelected(null);
						}}
					>
						{t("关闭", "Close")}
					</Button>
				</View>
			)}
		</Page>
	);
}
