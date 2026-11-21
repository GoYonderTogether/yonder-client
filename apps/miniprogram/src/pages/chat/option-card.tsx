import { Image, Button as NativeButton, Text, View } from "@tarojs/components";
import type { Attachment } from "@yonder/protocol";
import { useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import { downloadAttachment } from "../../lib/runtime";
import { MessageBody } from "./markdown";

function OptionImage({ file }: { file: Attachment }) {
	const [path, setPath] = useState("");
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		let active = true;
		void downloadAttachment(file.id).then(
			(value) => {
				if (active) setPath(value);
			},
			() => {
				if (active) setFailed(true);
			},
		);
		return () => {
			active = false;
		};
	}, [file.id]);
	return path && !failed ? (
		<Image className="message-option-image" mode="aspectFit" src={path} onError={() => setFailed(true)} />
	) : (
		<View className="message-option-image">
			<Text>{failed ? t("附件加载失败", "Could not load the attachment") : t("正在加载…", "Loading…")}</Text>
		</View>
	);
}

export function MessageOptions({
	question,
	options,
	images,
	selected,
	onChoose,
}: {
	question: string | null;
	options: string[];
	images: (Attachment | undefined)[];
	selected: string | null;
	onChoose: ((body: string) => void) | undefined;
}) {
	return (
		<View className="message-option-card">
			{question?.trim() ? (
				<View className="message-option-card-heading">
					<Text className="message-option-card-icon" ariaHidden>
						?
					</Text>
					<View className="message-option-card-question">
						<MessageBody body={question} />
					</View>
				</View>
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
		</View>
	);
}
