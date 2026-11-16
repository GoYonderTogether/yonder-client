import { Button as NativeButton, ScrollView, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { isHttpLink } from "@yonder/chat-model";
import { type ChatTextHost, parseMessage, StreamingText } from "@yonder/chat-presentation";
import { type MarkdownToJSX, RuleType } from "markdown-to-jsx";
import { Fragment, useMemo } from "react";
import { t } from "../../lib/i18n";

type Node = MarkdownToJSX.ASTNode;
const nodeKey = (node: Node, position: number) => `${node.type}:${position}`;
const positionKey = (kind: string, position: number) => `${kind}:${position}`;

function Nodes({ nodes, streaming = false }: { nodes: Node[]; streaming?: boolean }) {
	return (
		<>
			{nodes.map((node, index) => (
				<Fragment key={nodeKey(node, index)}>
					<MarkdownNode node={node} streaming={streaming} />
				</Fragment>
			))}
		</>
	);
}

function MarkdownNode({ node, streaming }: { node: Node; streaming: boolean }) {
	switch (node.type) {
		case RuleType.text:
			return streaming ? (
				<StreamingText as={Text as unknown as ChatTextHost} text={node.text} />
			) : (
				<Text selectable userSelect>
					{node.text}
				</Text>
			);
		case RuleType.paragraph:
			return (
				<View className="message-content-paragraph message-content-block">
					<Nodes nodes={node.children} streaming={streaming} />
				</View>
			);
		case RuleType.heading:
			return (
				<View className={`message-content-heading message-content-heading-${node.level} message-content-block`}>
					<Nodes nodes={node.children} streaming={streaming} />
				</View>
			);
		case RuleType.textFormatted:
			return (
				<Text className={`message-content-${node.tag}`}>
					<Nodes nodes={node.children} streaming={streaming} />
				</Text>
			);
		case RuleType.codeInline:
			return (
				<Text selectable userSelect className="message-content-inline-code">
					{node.text}
				</Text>
			);
		case RuleType.codeBlock:
			return (
				<View className="message-code-block message-content-block">
					<NativeButton
						className="message-copy mini-chat-copy"
						ariaLabel={t("复制代码", "Copy code")}
						onClick={() => void Taro.setClipboardData({ data: node.text })}
					>
						<View className="mini-chat-copy-icon" />
					</NativeButton>
					<ScrollView className="message-code-scroll" scrollX>
						<Text selectable userSelect className="message-content-code">
							{node.text}
						</Text>
					</ScrollView>
				</View>
			);
		case RuleType.blockQuote:
			return (
				<View className="message-content-blockquote message-content-block">
					<Nodes nodes={node.children} streaming={streaming} />
				</View>
			);
		case RuleType.breakLine:
			return <Text>{"\n"}</Text>;
		case RuleType.breakThematic:
			return <View className="message-content-rule message-content-block" />;
		case RuleType.link: {
			const target = node.target ?? "";
			return isHttpLink(target) ? (
				<Text className="message-content-link" onClick={() => void Taro.setClipboardData({ data: target })}>
					<Nodes nodes={node.children} streaming={streaming} />
				</Text>
			) : (
				<Nodes nodes={node.children} streaming={streaming} />
			);
		}
		case RuleType.image:
			return null;
		case RuleType.orderedList:
		case RuleType.unorderedList:
			return (
				<View
					className={`message-content-list message-content-block ${node.type === RuleType.orderedList ? "message-content-list-ordered" : "message-content-list-unordered"}`}
				>
					{node.items.map((item, index) => (
						<View className="message-content-list-item" key={positionKey("item", index)}>
							<Text className="message-content-list-marker">
								{node.type === RuleType.orderedList ? `${(node.start ?? 1) + index}.` : "•"}
							</Text>
							<View className="message-content-list-body">
								<Nodes nodes={item} streaming={streaming} />
							</View>
						</View>
					))}
				</View>
			);
		case RuleType.table:
			return (
				<ScrollView className="message-content-table-scroll message-content-block" scrollX>
					<View className="message-content-table">
						<View className="message-content-table-row">
							{node.header.map((cell, index) => (
								<View
									className="message-content-table-cell message-content-table-head"
									key={positionKey("header", index)}
								>
									<Nodes nodes={cell} streaming={streaming} />
								</View>
							))}
						</View>
						{node.cells.map((row, index) => (
							<View className="message-content-table-row" key={positionKey("row", index)}>
								{row.map((cell, column) => (
									<View className="message-content-table-cell" key={positionKey("cell", column)}>
										<Nodes nodes={cell} streaming={streaming} />
									</View>
								))}
							</View>
						))}
					</View>
				</ScrollView>
			);
		case RuleType.gfmTask:
			return <Text>{node.completed ? "☑" : "☐"}</Text>;
		default:
			return "text" in node ? <Text selectable>{node.text}</Text> : null;
	}
}

export function MessageBody({ body, streaming = false }: { body: string; streaming?: boolean }) {
	const nodes = useMemo(() => parseMessage(body) as Node[], [body]);
	return (
		<View className="message-content">
			<Nodes nodes={nodes} streaming={streaming} />
		</View>
	);
}
