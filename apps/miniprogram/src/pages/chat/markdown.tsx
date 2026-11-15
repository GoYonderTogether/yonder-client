import { ScrollView, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { type MarkdownToJSX, parser, RuleType } from "markdown-to-jsx";
import { Fragment, useMemo } from "react";
import { t } from "../../lib/i18n";

type Node = MarkdownToJSX.ASTNode;
const nodeKey = (value: unknown, position: number) => JSON.stringify([value, position]);
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
	switch (node.type) {
		case RuleType.text:
			return (
				<Text selectable userSelect>
					{node.text}
				</Text>
			);
		case RuleType.paragraph:
			return (
				<View className="mini-md-paragraph">
					<Nodes nodes={node.children} />
				</View>
			);
		case RuleType.heading:
			return (
				<View className="mini-md-heading">
					<Nodes nodes={node.children} />
				</View>
			);
		case RuleType.textFormatted:
			return (
				<Text className={`mini-md-${["strong", "em", "del", "s", "mark"].includes(node.tag) ? node.tag : "plain"}`}>
					<Nodes nodes={node.children} />
				</Text>
			);
		case RuleType.codeInline:
			return (
				<Text selectable userSelect className="mini-md-code">
					<Text>{node.text}</Text>
				</Text>
			);
		case RuleType.codeBlock:
			return (
				<View className="mini-md-codeblock">
					<View className="row">
						<Text className="muted">{node.lang || t("代码", "Code")}</Text>
						<Text className="mini-link" onClick={() => void Taro.setClipboardData({ data: node.text })}>
							{t("复制", "Copy")}
						</Text>
					</View>
					<ScrollView scrollX>
						<Text selectable userSelect>
							{node.text}
						</Text>
					</ScrollView>
				</View>
			);
		case RuleType.blockQuote:
			return (
				<View className="mini-md-quote">
					<Nodes nodes={node.children} />
				</View>
			);
		case RuleType.breakLine:
			return <Text>{"\n"}</Text>;
		case RuleType.breakThematic:
			return <View className="mini-md-rule" />;
		case RuleType.link:
			return (
				<Text
					className="mini-link"
					onClick={() => {
						if (node.target && /^https?:\/\//i.test(node.target)) void Taro.setClipboardData({ data: node.target });
					}}
				>
					<Nodes nodes={node.children} />
				</Text>
			);
		case RuleType.image:
			return node.alt ? <Text>{node.alt}</Text> : null;
		case RuleType.orderedList:
		case RuleType.unorderedList:
			return (
				<View>
					{node.items.map((item, index) => (
						<View className="mini-md-list-item" key={nodeKey(item, index)}>
							<Text>{node.type === RuleType.orderedList ? `${(node.start ?? 1) + index}.` : "•"}</Text>
							<View className="mini-md-list-content">
								<Nodes nodes={item} />
							</View>
						</View>
					))}
				</View>
			);
		case RuleType.table:
			return (
				<ScrollView scrollX>
					<View className="mini-md-table">
						<View className="mini-md-table-row">
							{node.header.map((cell, index) => (
								<View className="mini-md-table-cell mini-md-strong" key={nodeKey(cell, index)}>
									<Nodes nodes={cell} />
								</View>
							))}
						</View>
						{node.cells.map((row, index) => (
							<View className="mini-md-table-row" key={nodeKey(row, index)}>
								{row.map((cell, column) => (
									<View className="mini-md-table-cell" key={nodeKey(cell, column)}>
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
export function MessageBody({ body }: { body: string }) {
	const nodes = useMemo(() => parser(body, { disableParsingRawHTML: true }), [body]);
	return (
		<View className="mini-markdown">
			<Nodes nodes={nodes} />
		</View>
	);
}
