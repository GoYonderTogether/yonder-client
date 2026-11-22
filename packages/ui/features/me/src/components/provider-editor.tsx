import type { Provider, ProviderModelMetadata } from "@yonder/protocol";
import { Button, Field, PasswordField, SelectField, TextField } from "@yonder/ui-components";
import { useDevices, useProviderActions } from "@yonder/ui-data";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProviderModelPicker } from "./provider-model-picker.tsx";

export interface ProviderPreset {
	id: string;
	name: string;
	baseUrl: string;
	models: string;
	keyUrl: string | null;
	protocol?: Provider["protocol"];
	note?: string | null;
	website?: string | null;
}

export function ProviderEditor({
	provider,
	preset,
	onChangePreset,
	onDirtyChange,
	onDone,
}: {
	provider?: Provider;
	preset?: ProviderPreset;
	onChangePreset?: () => void;
	onDirtyChange?: ((dirty: boolean) => void) | undefined;
	onDone: () => void;
}) {
	const { t } = useTranslation();
	const actions = useProviderActions();
	const devices = useDevices();
	const [name, setName] = useState(provider?.name ?? preset?.name ?? "");
	const [note, setNote] = useState(provider?.note ?? preset?.note ?? "");
	const [website, setWebsite] = useState(provider?.website ?? preset?.website ?? "");
	const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? preset?.baseUrl ?? "");
	const [protocol, setProtocol] = useState<Provider["protocol"]>(provider?.protocol ?? preset?.protocol ?? "openai");
	const [models, setModels] = useState(provider?.models.join(", ") ?? preset?.models ?? "");
	const [apiKey, setApiKey] = useState("");
	const [replacing, setReplacing] = useState(!provider?.keyConfigured);
	// The device gateway is the advanced half of the form, folded away until asked for.
	const [deviceGatewayOpen, setDeviceGatewayOpen] = useState(provider?.origin === "device");
	const [origin, setOrigin] = useState<"cloud" | "device">(provider?.origin ?? "cloud");
	const [deviceId, setDeviceId] = useState<string>(provider?.deviceId ?? "");
	const relayDevices = devices.data?.items.filter((device) => device.platform !== "web") ?? [];
	const destinationChanged = Boolean(
		provider &&
			(normaliseUrl(baseUrl) !== normaliseUrl(provider.baseUrl) ||
				protocol !== provider.protocol ||
				origin !== provider.origin ||
				deviceId !== (provider.deviceId ?? "")),
	);
	const needsKey = replacing || destinationChanged;
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [available, setAvailable] = useState<string[]>([]);
	const [metadata, setMetadata] = useState<Record<string, ProviderModelMetadata>>({});
	const [fetching, setFetching] = useState(false);
	const discoveryVersion = useRef(0);
	const original = useRef(
		JSON.stringify({ name, note, website, baseUrl, protocol, models, replacing, origin, deviceId }),
	);
	const dirty =
		Boolean(apiKey) ||
		JSON.stringify({ name, note, website, baseUrl, protocol, models, replacing, origin, deviceId }) !==
			original.current;
	const selected = models
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
	useEffect(() => {
		onDirtyChange?.(dirty);
	}, [dirty, onDirtyChange]);
	useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
	useEffect(() => {
		if (!needsKey) setApiKey("");
	}, [needsKey]);
	function resetDiscovery() {
		discoveryVersion.current += 1;
		setAvailable([]);
		setMetadata({});
		setFetching(false);
	}
	async function discover() {
		if (!isUsableAddress(baseUrl, origin)) {
			setError(t("models.invalidUrl"));
			return;
		}
		setFetching(true);
		setError(null);
		const version = ++discoveryVersion.current;
		try {
			const result = await actions.discoverModels({
				baseUrl: baseUrl.trim(),
				protocol,
				...(needsKey ? { apiKey } : provider ? { providerId: provider.id } : {}),
			});
			if (version !== discoveryVersion.current) return;
			setAvailable(result.models);
			setMetadata(result.metadata ?? {});
			if (!result.models.length) setError(t("models.fetchFailed"));
		} catch {
			if (version === discoveryVersion.current) setError(t("models.fetchFailed"));
		} finally {
			if (version === discoveryVersion.current) setFetching(false);
		}
	}
	async function save(event: React.FormEvent) {
		event.preventDefault();
		if (!isUsableAddress(baseUrl, origin) || (website.trim() && !isHttpsAddress(website))) {
			setError(t("models.invalidUrl"));
			return;
		}
		if (origin === "device" && !deviceId) {
			setError(t("models.deviceRequired"));
			return;
		}
		const modelIds = models
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean);
		if (!name.trim() || !modelIds.length || (needsKey && !apiKey.trim())) {
			setError(t("models.invalid"));
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const selectedMetadata = Object.fromEntries(
				modelIds.filter((id) => metadata[id]).map((id) => [id, metadata[id] as ProviderModelMetadata]),
			);
			await actions.save(provider?.id, {
				name: name.trim(),
				note: note.trim() || null,
				website: website.trim() || null,
				baseUrl: normaliseUrl(baseUrl),
				protocol,
				models: modelIds,
				...(Object.keys(selectedMetadata).length ? { metadata: selectedMetadata } : {}),
				...(needsKey ? { apiKey } : {}),
				// The server re-checks both: cloud must be public https, device must name an owned device.
				...(origin !== (provider?.origin ?? "cloud") || origin === "device" || provider ? { origin } : {}),
				...(origin === "device" ? { deviceId } : {}),
			});
			setApiKey("");
			onDone();
		} catch {
			setError(t("models.saveFailed"));
		} finally {
			setSaving(false);
		}
	}
	return (
		<form noValidate onSubmit={(event) => void save(event)} className="flex flex-col gap-[var(--spacing-4)]">
			{preset ? (
				<div className="flex items-center justify-between gap-[var(--spacing-2)] text-body">
					<span>{preset.name || t("models.custom")}</span>
					{onChangePreset ? (
						<Button
							variant="link"
							size="sm"
							onClick={() => {
								if (!dirty || window.confirm(t("models.discard"))) onChangePreset?.();
							}}
						>
							{t("models.chooseAgain")}
						</Button>
					) : null}
				</div>
			) : null}
			<TextField label={t("models.name")} value={name} onChange={(event) => setName(event.target.value)} required />
			<TextField label={t("models.note")} value={note} onChange={(event) => setNote(event.target.value)} />
			<TextField
				label={t("models.website")}
				type="url"
				value={website}
				onChange={(event) => setWebsite(event.target.value)}
			/>
			<TextField
				label={t("models.baseUrl")}
				type="url"
				value={baseUrl}
				onChange={(event) => {
					setBaseUrl(event.target.value);
					resetDiscovery();
				}}
				required
			/>
			<SelectField
				label={t("models.protocol")}
				value={protocol}
				onChange={(value) => {
					setProtocol(value as Provider["protocol"]);
					resetDiscovery();
				}}
				options={[
					{ value: "openai", label: t("models.openaiProtocol") },
					{ value: "anthropic", label: t("models.anthropicProtocol") },
				]}
			/>
			<TextField
				label={t("models.modelIds")}
				value={models}
				onChange={(event) => setModels(event.target.value)}
				required
			/>
			{needsKey ? (
				<Field
					label={t("models.apiKey")}
					htmlFor="provider-key"
					hint={destinationChanged ? t("models.keyRequiredForChange") : undefined}
					action={
						preset?.keyUrl ? (
							<a
								className="inline-flex items-center gap-[var(--spacing-1)] text-caption text-[var(--color-accent-text)] underline"
								href={preset.keyUrl}
								target="_blank"
								rel="noreferrer"
							>
								{t("models.getKey")} <ExternalLink size={12} aria-hidden="true" />
							</a>
						) : undefined
					}
				>
					<PasswordField
						id="provider-key"
						value={apiKey}
						onChange={(event) => {
							setApiKey(event.target.value);
							resetDiscovery();
						}}
						showLabel={t("models.showKey")}
						hideLabel={t("models.hideKey")}
						autoComplete="off"
						autoCapitalize="off"
						required
					/>
				</Field>
			) : (
				<div className="flex items-center justify-between">
					<span className="text-caption text-[var(--color-text-secondary)]">
						{t("models.apiKey")} · {t("models.keySaved")}
					</span>
					<Button variant="link" size="sm" onClick={() => setReplacing(true)}>
						{t("models.replaceKey")}
					</Button>
				</div>
			)}
			{/* The device gateway: advanced, folded away. Expanding it changes the form —
			    the address may then be localhost, and a device must be picked. */}
			{deviceGatewayOpen ? (
				<div className="flex flex-col gap-[var(--spacing-3)] border-t border-[var(--color-border-subtle)] pt-[var(--spacing-4)]">
					<SelectField
						label={t("models.origin")}
						value={origin}
						onChange={(value) => {
							setOrigin(value as "cloud" | "device");
							resetDiscovery();
						}}
						options={[
							{ value: "cloud", label: t("models.originCloud") },
							{ value: "device", label: t("models.originDevice") },
						]}
					/>
					{origin === "device" ? (
						devices.isLoading ? (
							<p role="status" className="text-caption text-[var(--color-text-secondary)]">
								{t("app.loading")}
							</p>
						) : relayDevices.length ? (
							<SelectField
								label={t("models.relayDevice")}
								value={deviceId}
								onChange={setDeviceId}
								options={relayDevices.map((device) => ({
									value: device.id,
									label: `${device.name}${device.status === "online" ? "" : ` · ${t("models.deviceOffline")}`}`,
								}))}
							/>
						) : (
							<p className="text-caption text-[var(--color-text-secondary)]">{t("models.noRelayDevice")}</p>
						)
					) : null}
				</div>
			) : (
				<Button type="button" variant="link" size="sm" onClick={() => setDeviceGatewayOpen(true)}>
					{t("models.deviceGateway")}
				</Button>
			)}
			<Button
				type="button"
				onClick={() => void discover()}
				loading={fetching}
				disabled={!baseUrl.trim() || (needsKey && !apiKey.trim())}
			>
				{t("models.fetchModels")}
			</Button>
			{available.length ? (
				<ProviderModelPicker
					available={available}
					selected={selected}
					hasMetadata={Object.keys(metadata).length > 0}
					onChange={(ids) => setModels(ids.join(", "))}
				/>
			) : null}
			{error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
			<Button type="submit" variant="primary" loading={saving}>
				{t("app.save")}
			</Button>
		</form>
	);
}

function isHttpsAddress(value: string): boolean {
	try {
		const url = new URL(value.trim());
		return (
			url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash
		);
	} catch {
		return false;
	}
}

/** Cloud providers must be public https; a device gateway may be localhost or plain http. */
function isUsableAddress(value: string, origin: "cloud" | "device"): boolean {
	if (origin === "device") {
		try {
			const url = new URL(value.trim());
			return Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash;
		} catch {
			return false;
		}
	}
	return isHttpsAddress(value);
}

function normaliseUrl(value: string): string {
	return value.trim().replace(/\/+$/, "");
}
