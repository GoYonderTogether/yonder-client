import { Switch, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { Provider } from "@yonder/protocol";
import { useState } from "react";
import { action, Button, Field, Page, State } from "../../components/ui";
import { useResource } from "../../components/use-resource";
import { t } from "../../lib/i18n";
import { api } from "../../lib/runtime";

export default function Models() {
	const { data, loading, error, reload } = useResource(() => api.providers());
	const [editing, setEditing] = useState<Provider | null>(null);
	const [form, setForm] = useState(false);
	const [name, setName] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [models, setModels] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [anthropic, setAnthropic] = useState(false);
	const edit = (provider: Provider | null) => {
		setEditing(provider);
		setName(provider?.name || "");
		setBaseUrl(provider?.baseUrl || "");
		setModels(provider?.models.join(", ") || "");
		setApiKey("");
		setAnthropic(provider?.protocol === "anthropic-messages");
		setForm(true);
	};
	return (
		<Page title={t("模型", "Models")}>
			<State loading={loading} error={error} retry={() => void reload()} />
			<View className="mini-card">
				<Text className="mini-subtitle">{t("平台模型", "Platform models")}</Text>
				{data?.platformModels
					.filter((model) => model.enabled)
					.map((model) => (
						<View className="mini-row" key={model.id}>
							<Text>{model.name}</Text>
							{model.isDefault && <Text className="mini-muted">{t("默认", "Default")}</Text>}
						</View>
					))}
			</View>
			{data?.items
				.filter((provider) => provider.scope === "user")
				.map((provider) => (
					<View className="mini-card" key={provider.id}>
						<Text className="mini-subtitle">{provider.name}</Text>
						<Text className="mini-muted">{provider.models.join(", ")}</Text>
						<View className="actions">
							<Button secondary onClick={() => edit(provider)}>
								{t("编辑", "Edit")}
							</Button>
							<Button
								secondary
								onClick={() =>
									void action(async () => {
										await api.setDefaultProvider(provider.id);
										await reload();
									})
								}
							>
								{provider.isDefault ? t("默认", "Default") : t("设为默认", "Set default")}
							</Button>
							<Button
								secondary
								onClick={() =>
									void action(async () => {
										const result = await api.testProvider(provider.id);
										if (!result.ok) throw new Error(t("连接失败", "Connection failed"));
										void Taro.showToast({ title: t("连接成功", "Connected"), icon: "success" });
									})
								}
							>
								{t("测试", "Test")}
							</Button>
							<Button
								danger
								onClick={() =>
									void action(async () => {
										const confirmed = await Taro.showModal({
											title: t("删除自定义模型？", "Delete custom provider?"),
											confirmText: t("删除", "Delete"),
											cancelText: t("取消", "Cancel"),
										});
										if (!confirmed.confirm) return;
										await api.deleteProvider(provider.id);
										await reload();
									})
								}
							>
								{t("删除", "Delete")}
							</Button>
						</View>
					</View>
				))}
			<Button secondary onClick={() => edit(null)}>
				{t("添加自定义模型", "Add custom models")}
			</Button>
			{form && (
				<View className="mini-card">
					<Field label={t("名称", "Name")} value={name} onInput={setName} />
					<Field label={t("API 地址", "API URL")} value={baseUrl} onInput={setBaseUrl} />
					<Field label={t("模型名称，逗号分隔", "Model IDs, comma separated")} value={models} onInput={setModels} />
					<Field label={t("API 密钥", "API key")} value={apiKey} onInput={setApiKey} password />
					<View className="mini-row">
						<Text>Anthropic</Text>
						<Switch checked={anthropic} onChange={(event) => setAnthropic(event.detail.value)} />
					</View>
					<Button
						secondary
						disabled={!baseUrl}
						onClick={() =>
							void action(async () => {
								const result = await api.discoverModels({
									baseUrl,
									protocol: anthropic ? "anthropic-messages" : "openai-chat",
									...(apiKey ? { apiKey } : {}),
									...(editing ? { providerId: editing.id } : {}),
								});
								setModels(result.models.join(", "));
							})
						}
					>
						{t("获取模型列表", "Discover models")}
					</Button>
					<Button
						disabled={!name.trim() || !baseUrl.trim() || !models.trim() || (!editing && !apiKey)}
						onClick={() =>
							void action(async () => {
								const body = {
									name: name.trim(),
									baseUrl: baseUrl.trim(),
									protocol: anthropic ? ("anthropic-messages" as const) : ("openai-chat" as const),
									models: models
										.split(",")
										.map((item) => item.trim())
										.filter(Boolean),
									...(apiKey ? { apiKey } : {}),
								};
								if (editing) await api.updateProvider(editing.id, body);
								else await api.createProvider(body);
								setApiKey("");
								setForm(false);
								await reload();
							})
						}
					>
						{t("保存", "Save")}
					</Button>
					<Button
						secondary
						onClick={() => {
							setForm(false);
							setApiKey("");
						}}
					>
						{t("取消", "Cancel")}
					</Button>
				</View>
			)}
		</Page>
	);
}
