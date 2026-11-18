import { Switch, Text, View } from "@tarojs/components";
import type { PrivacySettings, UpdatePrivacyRequest } from "@yonder/protocol";
import { useState } from "react";
import { Page, State } from "../../components/ui";
import { useResource } from "../../components/use-resource";
import { t, useLocale } from "../../lib/i18n";
import { api } from "../../lib/runtime";
import { confirmed, optimistic, type PrivacyKey, privacyKeys, reverted, shown } from "./model";

function label(key: PrivacyKey): string {
	switch (key) {
		case "searchable":
			return t("陌生人可通过对外号找到我", "Strangers can find me by my handle");
		case "cardForUsers":
			return t("登录用户可以查看我的名片", "Signed-in people can view my card");
		case "cardPublicLink":
			return t("未登录的人可以通过链接查看我的名片", "People who are not signed in can view my card via its link");
	}
}

/** Each switch saves on flip; a failure puts that one switch back and shows the real reason. */
export default function Privacy() {
	useLocale();
	const { data, loading, error, reload } = useResource(() => api.privacy());
	const [pending, setPending] = useState<Partial<PrivacySettings>>({});
	const [saving, setSaving] = useState<PrivacyKey | null>(null);
	const [failure, setFailure] = useState("");
	const change = async (key: PrivacyKey, next: boolean) => {
		const previous = shown(pending, data, key);
		setPending((current) => optimistic(current, key, next));
		setSaving(key);
		setFailure("");
		const body: UpdatePrivacyRequest = { [key]: next };
		try {
			const saved = await api.updatePrivacy(body);
			setPending((current) => confirmed(current, saved));
		} catch (cause) {
			setPending((current) => reverted(current, key, previous));
			setFailure(cause instanceof Error ? cause.message : t("保存失败，请重试", "Could not save. Try again."));
		} finally {
			setSaving(null);
		}
	};
	return (
		<Page title={t("账号隐私", "Account privacy")}>
			<State loading={loading} error={error} retry={() => void reload()} />
			{data ? (
				<View className="mini-card">
					{privacyKeys.map((key) => (
						<View className="mini-row" key={key}>
							<View className="mini-row-main">
								<Text>{label(key)}</Text>
							</View>
							<Switch
								checked={shown(pending, data, key)}
								disabled={saving !== null}
								onChange={(event) => void change(key, event.detail.value)}
							/>
						</View>
					))}
					{failure ? <Text className="mini-error">{failure}</Text> : null}
				</View>
			) : null}
		</Page>
	);
}
