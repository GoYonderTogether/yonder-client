import { Text, View } from "@tarojs/components";
import { useRouter } from "@tarojs/taro";
import { getLegalDocument } from "@yonder/feature-legal";
import { Page } from "../../components/ui";
import { useLocale } from "../../lib/i18n";

export default function Legal() {
	const { locale } = useLocale();
	const kind = useRouter().params.kind === "privacy" ? "privacy" : "terms";
	const document = getLegalDocument(kind, locale);
	return (
		<Page publicPage title={document.title}>
			<View className="mini-card">
				<Text className="mini-muted">
					{document.version} · {document.effectiveDate}
				</Text>
				{document.intro.map((paragraph) => (
					<Text key={paragraph} className="mini-pre">
						{paragraph}
						{"\n\n"}
					</Text>
				))}
				{document.sections.map((section) => (
					<View key={section.heading}>
						<Text className="mini-subtitle">{section.heading}</Text>
						{section.paragraphs.map((paragraph) => (
							<Text key={paragraph} className="mini-pre" selectable>
								{paragraph}
								{"\n\n"}
							</Text>
						))}
					</View>
				))}
			</View>
		</Page>
	);
}
