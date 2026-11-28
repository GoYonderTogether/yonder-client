import { Button as NativeButton, ScrollView, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import {
	type DeviceFileReference,
	deviceFileName,
	isHttpLink,
	linkedDeviceFileReference,
	plainDeviceFileReference,
	quotedDeviceFiles,
} from "@yonder/chat-model";
import { mapMessageText, parseMessage } from "@yonder/chat-presentation";
import { type MarkdownToJSX, RuleType } from "markdown-to-jsx";
import { createContext, Fragment, type ReactNode, useContext, useMemo } from "react";
import { openDeviceFile } from "../../lib/device-file-navigation";
import { t } from "../../lib/i18n";

type Node = MarkdownToJSX.ASTNode;
const nodeKey = (node: Node, position: number) => `${node.type}:${position}`;
const positionKey = (kind: string, position: number) => `${kind}:${position}`;
const DeviceFiles = createContext(false);

function FileLink({ reference, children }: { reference: DeviceFileReference; children?: ReactNode }) {
	return (
		<Text className="message-content-link" ariaRole="button" onClick={() => openDeviceFile(reference)}>
			{children ?? deviceFileName(reference.path)}
		</Text>
	);
}

function QuotedPaths({ value }: { value: string }) {
	const links = quotedDeviceFiles(value);
	if (!links.length)
		return (
			<Text selectable userSelect>
				{value}
			</Text>
		);
	return (
		<Text>
			{links.map(({ index, reference }, position) => (
				<Fragment key={index}>
					{value.slice(position ? links[position - 1].index + links[position - 1].length : 0, index)}
					<FileLink reference={reference} />
				</Fragment>
			))}
			{value.slice(links[links.length - 1].index + links[links.length - 1].length)}
		</Text>
	);
}

function Nodes({ nodes }: { nodes: Node[] }) {
	return (
		<>
			{nodes.map((node, index) => (
				<Fragment key={nodeKey(node, index)}>
					<MarkdownNode node={node} />
				</Fragment>
			))}
		</>
	);
}

function MarkdownNode({ node }: { node: Node }) {
	const deviceFiles = useContext(DeviceFiles);
	switch (node.type) {
		case RuleType.text:
			return deviceFiles ? (
				<QuotedPaths value={node.text} />
			) : (
				<Text selectable userSelect>
					{node.text}
				</Text>
			);
		case RuleType.paragraph:
			return (
				<View className="message-content-paragraph message-content-block">
					<Nodes nodes={node.children} />
				</View>
			);
		case RuleType.heading:
			return (
				<View className={`message-content-heading message-content-heading-${node.level} message-content-block`}>
					<Nodes nodes={node.children} />
				</View>
			);
		case RuleType.textFormatted:
			return (
				<Text className={`message-content-${node.tag}`}>
					<Nodes nodes={node.children} />
				</Text>
			);
		case RuleType.codeInline: {
			const reference = deviceFiles && plainDeviceFileReference(node.text);
			return reference ? (
				<FileLink reference={reference} />
			) : (
				<Text selectable userSelect className="message-content-inline-code">
					{node.text}
				</Text>
			);
		}
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
					<Nodes nodes={node.children} />
				</View>
			);
		case RuleType.breakLine:
			return <Text>{"\n"}</Text>;
		case RuleType.breakThematic:
			return <View className="message-content-rule message-content-block" />;
		case RuleType.link: {
			const target = node.target ?? "";
			const reference = deviceFiles && linkedDeviceFileReference(target);
			const label = (
				<DeviceFiles.Provider value={false}>
					<Nodes nodes={node.children} />
				</DeviceFiles.Provider>
			);
			if (reference) return <FileLink reference={reference}>{label}</FileLink>;
			return isHttpLink(target) ? (
				<Text className="message-content-link" onClick={() => void Taro.setClipboardData({ data: target })}>
					{label}
				</Text>
			) : (
				label
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
								<Nodes nodes={item} />
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
									<Nodes nodes={cell} />
								</View>
							))}
						</View>
						{node.cells.map((row, index) => (
							<View className="message-content-table-row" key={positionKey("row", index)}>
								{row.map((cell, column) => (
									<View className="message-content-table-cell" key={positionKey("cell", column)}>
										<Nodes nodes={cell} />
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

export function MessageBody({
	body,
	streaming = false,
	allowDeviceFiles = false,
}: {
	body: string;
	streaming?: boolean;
	allowDeviceFiles?: boolean;
}) {
	const deviceFiles = allowDeviceFiles && !streaming;
	const nodes = useMemo(() => {
		const parsed = parseMessage(body);
		return deviceFiles
			? mapMessageText(parsed, (text, inlineCode) => [
					inlineCode ? { type: RuleType.codeInline, text } : { type: RuleType.text, text },
				])
			: parsed;
	}, [body, deviceFiles]);
	return (
		<View className="message-content">
			<DeviceFiles.Provider value={deviceFiles}>
				<Nodes nodes={nodes} />
			</DeviceFiles.Provider>
		</View>
	);
}
