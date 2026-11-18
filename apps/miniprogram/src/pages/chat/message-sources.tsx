import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { runSources } from "@yonder/chat-model";
import type { Run } from "@yonder/protocol";
import { useState } from "react";
import { t } from "../../lib/i18n";

export function MessageSources({ run }: { run: Run | null | undefined }) {
	const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
	const sources = runSources(run);
	if (!sources.length) return null;
	const open = expandedRunId === run?.id;
	return (
		<View className="mini-muted">
			<Text onClick={() => setExpandedRunId(open ? null : (run?.id ?? null))}>{t("来源", "Sources")}</Text>
			{open
				? sources.map((source) => (
						<View key={JSON.stringify(source)}>
							<Text className="message-content-link" onClick={() => void Taro.setClipboardData({ data: source.url })}>
								{source.title || source.site || source.url}
							</Text>
							{source.site && source.site !== source.title ? <Text> · {source.site}</Text> : null}
						</View>
					))
				: null}
		</View>
	);
}
