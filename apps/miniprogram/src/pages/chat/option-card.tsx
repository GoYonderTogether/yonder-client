import { Image, Button as NativeButton, ScrollView, Text, View } from "@tarojs/components";
import { InteractionCard } from "@yonder/chat-presentation";
import type { Attachment } from "@yonder/protocol";
import { useEffect, useState } from "react";
import { useVisibleImage } from "../../components/visible-image";
import { PREVIEW_MAX_LINES, previewHeightLines } from "../../lib/agent-card-view";
import { t } from "../../lib/i18n";
import { downloadAttachmentImage, useSession } from "../../lib/runtime";
import { ChatView } from "./host";
import { MessageBody } from "./markdown";

export function OptionImage({ file }: { file: Attachment }) {
	const [loaded, setLoaded] = useState<{ fileId: string; owner: string; path: string }>();
	const [failed, setFailed] = useState(false);
	const { memberId } = useSession();
	const { id: fileId, kind, name } = file;
	const path = loaded && loaded.owner === memberId && loaded.fileId === fileId ? loaded.path : "";
	const { id, visible } = useVisibleImage(true, ".mini-message-list");
	useEffect(() => {
		if (!visible || !memberId) return;
		let active = true;
		setFailed(false);
		void downloadAttachmentImage({ id: fileId, kind, name }, "thumb").then(
			(value) => {
				if (active) setLoaded({ fileId, owner: memberId, path: value });
			},
			() => {
				if (active) setFailed(true);
			},
		);
		return () => {
			active = false;
		};
	}, [fileId, kind, memberId, name, visible]);
	return (
		<View id={id}>
			{path && !failed ? (
				<Image
					className="message-option-image"
					mode="aspectFit"
					src={path}
					ariaLabel={file.name}
					onError={() => setFailed(true)}
				/>
			) : (
				<View className="message-option-image">
					<Text>{failed ? t("附件加载失败", "Could not load the attachment") : t("正在加载…", "Loading…")}</Text>
				</View>
			)}
		</View>
	);
}

export function MessageOptions({
	question,
	preview,
	result,
	options,
	images,
	selected,
	onChoose,
}: {
	question: string | null;
	/** Markdown the server wants shown before the options, such as the exact things a card will delete. */
	preview?: string | undefined;
	/** What became of the choice, one line under the options: done, or why it was not. */
	result?: string | undefined;
	options: string[];
	images: (Attachment | undefined)[];
	selected: string | null;
	onChoose: ((body: string) => void) | undefined;
}) {
	const previewLines = preview ? previewHeightLines(preview) : null;
	return (
		<InteractionCard
			as={ChatView}
			label={question ?? undefined}
			title={question?.trim() ? <MessageBody body={question} /> : null}
			glyph={<Text ariaHidden>?</Text>}
		>
			{preview ? (
				previewLines ? (
					<ScrollView
						className="message-option-card-preview"
						style={{ height: `calc(var(--text-body--line-height) * ${PREVIEW_MAX_LINES})` }}
						scrollY
						enhanced
						bounces={false}
						onTouchMove={(event) => event.stopPropagation()}
					>
						<MessageBody body={preview} />
					</ScrollView>
				) : (
					<View className="message-option-card-preview">
						<MessageBody body={preview} />
					</View>
				)
			) : null}
			<View className="message-option-list">
				{options.map((option, index) => {
					const file = images[index];
					const chosen = option === selected;
					return (
						<View key={option}>
							<NativeButton
								className={`message-option-row ${chosen ? "message-option-row-chosen" : ""}`}
								ariaLabel={chosen ? t(`已选择 ${option}`, `Selected ${option}`) : option}
								disabled={!onChoose || undefined}
								onClick={() => onChoose?.(option)}
							>
								<View className="message-option-choice">
									<Text>{option}</Text>
									{file ? <OptionImage key={file.id} file={file} /> : null}
								</View>
								<Text className="message-option-indicator" ariaHidden>
									{chosen ? "✓" : onChoose ? "›" : ""}
								</Text>
							</NativeButton>
						</View>
					);
				})}
			</View>
			{result ? <Text className="message-option-card-result">{result}</Text> : null}
		</InteractionCard>
	);
}
