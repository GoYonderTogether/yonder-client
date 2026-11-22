import { Button, ListGroup, ListRow, SearchInput } from "@yonder/ui-components";
import { useDevices, useProviderActions, useProviders } from "@yonder/ui-data";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DefaultModelSection } from "./default-model-section.tsx";
import { ProviderEditor } from "./provider-editor.tsx";
import {
	isLegacyDeviceProvider,
	localProviderBinding,
	type ProviderAddFailure,
	type ProviderPreset,
	providerDeviceLabel,
	type RegisterLocalProviderEndpoint,
} from "./provider-location.ts";
import { ProviderRow } from "./provider-row.tsx";

const PRESETS: ProviderPreset[] = [
	{ id: "custom", name: "", baseUrl: "", models: "", keyUrl: null },
	{
		id: "deepseek",
		name: "DeepSeek",
		baseUrl: "https://api.deepseek.com",
		models: "deepseek-flash",
		keyUrl: "https://platform.deepseek.com/api_keys",
		website: "https://www.deepseek.com",
	},
];

export function ModelsSection({
	page,
	onOpenPage,
	onDirtyChange,
	registerEndpoint,
	onAddFailure,
}: {
	page: string | null;
	onOpenPage: (page: string | null) => void;
	onDirtyChange?: ((dirty: boolean) => void) | undefined;
	registerEndpoint?: RegisterLocalProviderEndpoint | undefined;
	onAddFailure?: ProviderAddFailure | undefined;
}) {
	const { t, i18n } = useTranslation();
	const devices = useDevices();
	const location = { devices: devices.data?.items, registerEndpoint };
	const providers = useProviders();
	const actions = useProviderActions();
	const [preset, setPreset] = useState<ProviderPreset | null>(null);
	const [notice, setNotice] = useState<{ id: string; ok: boolean } | null>(null);
	const [search, setSearch] = useState("");
	const userProviders = providers.data?.items.filter((provider) => provider.scope === "user") ?? [];
	if (page === "add") {
		if (preset)
			return (
				<ProviderEditor
					{...location}
					key={preset.id}
					preset={preset}
					onAddFailure={onAddFailure}
					onDirtyChange={onDirtyChange}
					onChangePreset={() => setPreset(null)}
					onDone={() => {
						onDirtyChange?.(false);
						setPreset(null);
						onOpenPage(null);
					}}
				/>
			);
		return (
			<ListGroup title={t("models.choose")}>
				{PRESETS.map((entry) => (
					<ListRow
						key={entry.id}
						title={entry.id === "custom" ? t("models.custom") : entry.name}
						subtitle={entry.baseUrl || undefined}
						chevron
						onClick={() => setPreset(entry)}
					/>
				))}
			</ListGroup>
		);
	}
	if (page?.startsWith("edit-")) {
		const provider = userProviders.find((item) => item.id === page.slice(5));
		return provider && !isLegacyDeviceProvider(provider) ? (
			<ProviderEditor
				{...location}
				key={provider.id}
				provider={provider}
				onDirtyChange={onDirtyChange}
				onDone={() => {
					onDirtyChange?.(false);
					onOpenPage(null);
				}}
			/>
		) : (
			<p role="status">{providers.isLoading ? t("app.loading") : t("errors.not_found")}</p>
		);
	}
	if (page?.startsWith("duplicate-")) {
		const provider = userProviders.find((item) => item.id === page.slice(10));
		return provider && !isLegacyDeviceProvider(provider) ? (
			<ProviderEditor
				{...location}
				key={`duplicate-${provider.id}`}
				preset={{
					id: "copy",
					name: t("models.copyName", { name: provider.name }),
					baseUrl: provider.baseUrl,
					models: provider.models.join(", "),
					protocol: provider.protocol,
					target: localProviderBinding(provider),
					note: provider.note ?? null,
					website: provider.website ?? null,
					keyUrl: null,
				}}
				onDirtyChange={onDirtyChange}
				onDone={() => {
					onDirtyChange?.(false);
					onOpenPage(null);
				}}
			/>
		) : (
			<p role="status">{providers.isLoading ? t("app.loading") : t("errors.not_found")}</p>
		);
	}
	const query = search.trim().toLowerCase();
	const filtered = userProviders.filter((provider) =>
		[
			provider.name,
			provider.note,
			provider.website,
			provider.origin !== "device" && provider.baseUrl,
			...provider.models,
		].some((value) => typeof value === "string" && value.toLowerCase().includes(query)),
	);
	const total = userProviders.length;
	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			<DefaultModelSection />
			<div className="flex justify-end">
				<Button
					variant="primary"
					onClick={() => {
						setPreset(null);
						onOpenPage("add");
					}}
				>
					<span className="inline-flex items-center gap-[var(--spacing-2)]">
						<Plus size={16} aria-hidden="true" />
						{t("models.add")}
					</span>
				</Button>
			</div>
			<SearchInput
				placeholder={t("models.search")}
				value={search}
				onChange={(event) => setSearch(event.target.value)}
			/>
			{providers.isLoading ? <p role="status">{t("app.loading")}</p> : null}
			{providers.isError ? (
				<Button variant="link" onClick={() => void providers.refetch()}>
					{t("app.retry")}
				</Button>
			) : null}
			{providers.data && total === 0 ? (
				<p className="text-caption text-[var(--color-text-secondary)]">{t("models.empty")}</p>
			) : null}
			{total > 0 && filtered.length === 0 ? (
				<p className="text-caption text-[var(--color-text-secondary)]">{t("models.noMatches")}</p>
			) : null}
			{filtered.length > 0 ? (
				<ListGroup title={t("models.custom")}>
					{filtered.map((provider) => (
						<ProviderRow
							key={provider.id}
							provider={provider}
							deviceLabel={(() => {
								if (provider.origin !== "device") return undefined;
								const device = devices.data?.items.find(({ id }) => id === provider.deviceId);
								return device
									? providerDeviceLabel(device, t, i18n.resolvedLanguage ?? i18n.language)
									: (provider.deviceName ?? t("models.deviceUnavailable"));
							})()}
							notice={notice?.id === provider.id ? notice.ok : null}
							onEdit={isLegacyDeviceProvider(provider) ? undefined : () => onOpenPage(`edit-${provider.id}`)}
							onDefault={() => actions.setDefault.mutate(provider.id)}
							onDuplicate={isLegacyDeviceProvider(provider) ? undefined : () => onOpenPage(`duplicate-${provider.id}`)}
							onTest={() => {
								setNotice(null);
								actions.test.mutate(provider.id, {
									onSuccess: (result) => setNotice({ id: provider.id, ok: result.ok }),
									onError: () => setNotice({ id: provider.id, ok: false }),
								});
							}}
							onDelete={() => {
								if (window.confirm(t("models.deleteConfirm", { name: provider.name })))
									actions.remove.mutate(provider.id);
							}}
						/>
					))}
				</ListGroup>
			) : null}
			{actions.remove.isError || actions.setDefault.isError ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{t("models.saveFailed")}
				</p>
			) : null}
		</div>
	);
}
