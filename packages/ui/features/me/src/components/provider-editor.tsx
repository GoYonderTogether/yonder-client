import type { DeviceSummary, Provider, ProviderModelMetadata } from "@yonder/protocol";
import { Button, Field, PasswordField, SelectField, TextField } from "@yonder/ui-components";
import { useProviderActions } from "@yonder/ui-data";
import { DiscardChangesDialog } from "@yonder/ui-shell";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	CLOUD_PROVIDER,
	isHttpsAddress,
	isLocalProviderAddress,
	isLoopbackProviderAddress,
	localProviderBinding,
	type NativeProviderBinding,
	NEW_ENDPOINT,
	normaliseUrl,
	providerDeviceLabel,
	type RegisteredLocalProviderEndpoint,
	type RegisterLocalProviderEndpoint,
} from "./provider-location.ts";
import { ProviderModelPicker } from "./provider-model-picker.tsx";

export interface ProviderPreset {
	id: string;
	name: string;
	baseUrl: string;
	models: string;
	keyUrl: string | null;
	protocol?: Provider["protocol"];
	target?: NativeProviderBinding | undefined;
	note?: string | null;
	website?: string | null;
}

export function ProviderEditor({
	provider,
	preset,
	onChangePreset,
	onDirtyChange,
	onDone,
	devices = [],
	registerEndpoint,
}: {
	provider?: Provider;
	preset?: ProviderPreset;
	onChangePreset?: () => void;
	onDirtyChange?: ((dirty: boolean) => void) | undefined;
	onDone: () => void;
	devices?: readonly DeviceSummary[] | undefined;
	registerEndpoint?: RegisterLocalProviderEndpoint | undefined;
}) {
	const { t, i18n } = useTranslation();
	const actions = useProviderActions();
	const currentTarget = localProviderBinding(provider);
	const initialTarget = currentTarget ?? preset?.target;
	const [deviceId, setDeviceId] = useState(initialTarget?.deviceId ?? CLOUD_PROVIDER);
	const [endpointId, setEndpointId] = useState(initialTarget?.endpointId ?? "");
	const [localUrl, setLocalUrl] = useState("");
	const [localKey, setLocalKey] = useState("");
	const [protocol, setProtocol] = useState<Provider["protocol"]>(provider?.protocol ?? preset?.protocol ?? "openai");
	const registered = useRef<RegisteredLocalProviderEndpoint | null>(null);
	const onDevice = deviceId !== CLOUD_PROVIDER;
	const device = onDevice ? devices.find(({ id }) => id === deviceId) : undefined;
	const supportsDesktop = (candidate: DeviceSummary) => ["macos", "windows", "linux"].includes(candidate.platform);
	const canRegister = !!(registerEndpoint && device?.current && supportsDesktop(device));
	const fixedDeviceProtocol = currentTarget ? provider?.protocol : undefined;
	const known = device?.modelEndpoints ?? [];
	const endpoint = known.find((candidate) => candidate.endpointId === endpointId);
	const addEndpoint =
		!currentTarget && canRegister && (endpointId === NEW_ENDPOINT || (!endpointId && known.length === 0));
	const canSetLocalKey = canRegister && (addEndpoint || !!endpoint);
	const deviceProtocol = fixedDeviceProtocol ?? endpoint?.protocol ?? protocol;
	const targetReady = Boolean(
		(endpoint && endpoint.protocol === deviceProtocol) || (addEndpoint && isLocalProviderAddress(localUrl)),
	);
	const locationOptions = [
		{ value: CLOUD_PROVIDER, label: t("models.cloud") },
		...devices
			.filter(
				(candidate) =>
					supportsDesktop(candidate) &&
					(candidate.id === deviceId || candidate.modelEndpoints?.length || (registerEndpoint && candidate.current)),
			)
			.map((candidate) => ({
				value: candidate.id,
				label: providerDeviceLabel(candidate, t, i18n.resolvedLanguage ?? i18n.language),
			})),
		...(onDevice && !device ? [{ value: deviceId, label: t("models.deviceUnavailable") }] : []),
	];
	const [name, setName] = useState(provider?.name ?? preset?.name ?? "");
	const [note, setNote] = useState(provider?.note ?? preset?.note ?? "");
	const [website, setWebsite] = useState(provider?.website ?? preset?.website ?? "");
	const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? preset?.baseUrl ?? "");
	const [models, setModels] = useState(provider?.models.join(", ") ?? preset?.models ?? "");
	const [apiKey, setApiKey] = useState("");
	const [replacing, setReplacing] = useState(!provider?.keyConfigured);
	const destinationChanged = Boolean(
		provider && (normaliseUrl(baseUrl) !== normaliseUrl(provider.baseUrl) || protocol !== provider.protocol),
	);
	const needsKey = !onDevice && (replacing || destinationChanged || Boolean(currentTarget));
	const [confirmPreset, setConfirmPreset] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [available, setAvailable] = useState<string[]>([]);
	const [metadata, setMetadata] = useState<Record<string, ProviderModelMetadata>>({});
	const [fetching, setFetching] = useState(false);
	const discoveryVersion = useRef(0);
	const writing = useRef(false);
	const original = useRef(
		JSON.stringify({ name, note, website, baseUrl, protocol, models, replacing, deviceId, endpointId, localUrl }),
	);
	const dirty =
		Boolean(apiKey || localKey) ||
		JSON.stringify({ name, note, website, baseUrl, protocol, models, replacing, deviceId, endpointId, localUrl }) !==
			original.current;
	const selected = models
		.split(",")
		.map((id) => id.trim())
		.filter(Boolean);
	useEffect(() => {
		onDirtyChange?.(dirty);
	}, [dirty, onDirtyChange]);
	useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
	useEffect(
		() => () => {
			discoveryVersion.current += 1;
		},
		[],
	);
	useEffect(() => {
		if (!needsKey) setApiKey("");
	}, [needsKey]);
	function resetDiscovery() {
		discoveryVersion.current += 1;
		setAvailable([]);
		setMetadata({});
		setFetching(false);
	}
	async function resolveTarget(version: number): Promise<NativeProviderBinding> {
		const key = canSetLocalKey ? localKey.trim() : "";
		if (endpoint && !key) return { deviceId, endpointId: endpoint.endpointId };
		if (!registerEndpoint || !canRegister || (!endpoint && (!addEndpoint || !isLocalProviderAddress(localUrl))))
			throw new Error("Unapproved local endpoint");
		const address = normaliseUrl(localUrl);
		const previous = registered.current;
		let target =
			!endpoint &&
			previous?.baseUrl === address &&
			previous.protocol === deviceProtocol &&
			previous.target.deviceId === deviceId
				? previous.target
				: undefined;
		let revision = target ? previous?.revision : undefined;
		if (!target || key) {
			const local = { deviceId, baseUrl: address, protocol: deviceProtocol, label: t("models.localEndpoint") };
			const result = await registerEndpoint(
				endpoint
					? { deviceId, endpointId: endpoint.endpointId, apiKey: key }
					: { ...local, ...(key ? { apiKey: key } : {}) },
			);
			if ((endpoint && result.endpointId !== endpoint.endpointId) || (result.protocol ?? "openai") !== deviceProtocol)
				throw new Error("Unexpected endpoint");
			target = { deviceId, endpointId: result.endpointId };
			revision = result.revision;
			if (version === discoveryVersion.current) {
				if (!endpoint) registered.current = { baseUrl: address, protocol: deviceProtocol, target, revision };
				if (key) setLocalKey("");
			}
		}
		// Native registration emits readiness; only a fresh matching cloud acknowledgement can
		// send discovery or save to this ID. Never fall back to a different endpoint.
		for (const delay of [0, 150, 350, 750]) {
			if (delay) await new Promise<void>((resolve) => setTimeout(resolve, delay));
			if (version !== discoveryVersion.current) throw new Error("Selection changed");
			const { items } = await actions.readDevices();
			if (
				items
					.find((item) => item.id === deviceId)
					?.modelEndpoints?.some(
						(item) =>
							item.endpointId === target?.endpointId && item.revision === revision && item.protocol === deviceProtocol,
					)
			)
				return target;
		}
		throw new Error("Device endpoint not ready");
	}
	function chooseLocation(next: string) {
		setDeviceId(next);
		setLocalKey("");
		setEndpointId("");
		if (next !== CLOUD_PROVIDER && isLoopbackProviderAddress(baseUrl)) {
			setLocalUrl(baseUrl);
			setBaseUrl("");
		}
		setError(null);
		resetDiscovery();
	}

	async function discover() {
		if (writing.current) return;
		if (onDevice ? !targetReady || device?.status !== "online" : !isHttpsAddress(baseUrl)) {
			setError(
				t(
					onDevice
						? "models.deviceUnavailable"
						: isLoopbackProviderAddress(baseUrl)
							? "models.chooseDevice"
							: "models.invalidUrl",
				),
			);
			return;
		}
		writing.current = true;
		setFetching(true);
		setError(null);
		const version = ++discoveryVersion.current;
		try {
			const target = onDevice ? await resolveTarget(version) : null;
			if (version !== discoveryVersion.current) return;
			const result = await actions.discoverModels(
				target
					? { origin: "device", ...target, protocol: deviceProtocol }
					: {
							baseUrl: baseUrl.trim(),
							protocol,
							...(needsKey ? { apiKey } : provider ? { providerId: provider.id } : {}),
						},
			);
			if (version !== discoveryVersion.current) return;
			setAvailable(result.models);
			setMetadata(result.metadata ?? {});
			if (!result.models.length) setError(t("models.fetchFailed"));
		} catch {
			if (version === discoveryVersion.current) setError(t("models.fetchFailed"));
		} finally {
			writing.current = false;
			if (version === discoveryVersion.current) setFetching(false);
		}
	}
	async function save(event: React.FormEvent) {
		event.preventDefault();
		if (writing.current) return;
		if (!onDevice && isLoopbackProviderAddress(baseUrl)) {
			setError(t("models.chooseDevice"));
			return;
		}
		if (onDevice && !targetReady) {
			setError(t("models.deviceUnavailable"));
			return;
		}
		if ((!onDevice && !isHttpsAddress(baseUrl)) || (website.trim() && !isHttpsAddress(website))) {
			setError(t("models.invalidUrl"));
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
		writing.current = true;
		setSaving(true);
		setError(null);
		const version = ++discoveryVersion.current;
		setFetching(false);
		try {
			const target = onDevice ? await resolveTarget(version) : null;
			if (version !== discoveryVersion.current) return;
			const selectedMetadata = Object.fromEntries(
				modelIds.filter((id) => metadata[id]).map((id) => [id, metadata[id] as ProviderModelMetadata]),
			);
			await actions.save(provider?.id, {
				name: name.trim(),
				note: note.trim() || null,
				website: website.trim() || null,
				models: modelIds,
				...(Object.keys(selectedMetadata).length ? { metadata: selectedMetadata } : {}),
				...(target
					? { origin: "device", ...target, protocol: deviceProtocol }
					: { baseUrl: normaliseUrl(baseUrl), protocol, ...(needsKey ? { apiKey } : {}) }),
			});
			setApiKey("");
			onDone();
		} catch {
			setError(t("models.saveFailed"));
		} finally {
			writing.current = false;
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
								if (dirty) setConfirmPreset(true);
								else onChangePreset();
							}}
						>
							{t("models.chooseAgain")}
						</Button>
					) : null}
				</div>
			) : null}
			<TextField
				label={t("models.name")}
				value={name}
				onChange={(event) => setName(event.target.value)}
				required
				requiredMark
				disabled={saving}
			/>
			{locationOptions.length > 1 || isLoopbackProviderAddress(baseUrl) ? (
				<SelectField
					label={t("models.location")}
					value={deviceId}
					options={locationOptions}
					onChange={chooseLocation}
					disabled={saving || !!provider}
					requiredMark={!onDevice && isLoopbackProviderAddress(baseUrl)}
				/>
			) : null}
			<TextField label={t("models.note")} value={note} onChange={(event) => setNote(event.target.value)} />
			<TextField
				label={t("models.website")}
				type="url"
				value={website}
				onChange={(event) => setWebsite(event.target.value)}
			/>
			{onDevice ? (
				<>
					{known.length || !canRegister ? (
						<SelectField
							label={t("models.baseUrl")}
							requiredMark
							disabled={saving || !!currentTarget}
							value={endpointId || ""}
							onChange={(value) => {
								setEndpointId(value);
								setLocalKey("");
								setError(null);
								resetDiscovery();
							}}
							options={[
								{ value: "", label: t("models.chooseEndpoint") },
								...known.map((entry) => ({ value: entry.endpointId, label: entry.label })),
								...(canRegister && !currentTarget ? [{ value: NEW_ENDPOINT, label: t("models.newEndpoint") }] : []),
								...(endpointId && endpointId !== NEW_ENDPOINT && !endpoint
									? [{ value: endpointId, label: t("models.deviceUnavailable") }]
									: []),
							]}
						/>
					) : null}
					{addEndpoint ? (
						<TextField
							label={t("models.baseUrl")}
							type="url"
							value={localUrl}
							onChange={(event) => {
								setLocalUrl(event.target.value);
								setLocalKey("");
								setError(null);
								resetDiscovery();
							}}
							required
							requiredMark
							disabled={saving}
						/>
					) : null}
				</>
			) : (
				<TextField
					label={t("models.baseUrl")}
					type="url"
					value={baseUrl}
					onChange={(event) => {
						setBaseUrl(event.target.value);
						resetDiscovery();
					}}
					required
					requiredMark
					disabled={saving}
				/>
			)}
			{!onDevice || addEndpoint || endpoint ? (
				<SelectField
					label={t("models.protocol")}
					value={onDevice ? deviceProtocol : protocol}
					disabled={saving || (onDevice && (!!endpoint || !!fixedDeviceProtocol))}
					onChange={(value) => {
						setProtocol(value as Provider["protocol"]);
						setLocalKey("");
						setError(null);
						resetDiscovery();
					}}
					options={[
						{ value: "openai", label: t("models.openaiProtocol") },
						{ value: "anthropic", label: t("models.anthropicProtocol") },
					]}
				/>
			) : null}
			<TextField
				label={t("models.modelIds")}
				value={models}
				onChange={(event) => setModels(event.target.value)}
				required
				requiredMark
				disabled={saving}
			/>
			{canSetLocalKey || needsKey ? (
				<Field
					label={t("models.apiKey")}
					htmlFor="provider-key"
					requiredMark={needsKey}
					action={
						!onDevice && preset?.keyUrl ? (
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
						aria-label={t("models.apiKey")}
						value={onDevice ? localKey : apiKey}
						disabled={saving}
						onChange={(event) => {
							if (onDevice) setLocalKey(event.target.value);
							else setApiKey(event.target.value);
							resetDiscovery();
						}}
						showLabel={t("models.showKey")}
						hideLabel={t("models.hideKey")}
						autoComplete="off"
						autoCapitalize="off"
						required={needsKey}
					/>
				</Field>
			) : !onDevice ? (
				<div className="flex items-center justify-between">
					<span className="text-caption text-[var(--color-text-secondary)]">
						{t("models.apiKey")} · {t("models.keySaved")}
					</span>
					<Button variant="link" size="sm" onClick={() => setReplacing(true)}>
						{t("models.replaceKey")}
					</Button>
				</div>
			) : null}
			<Button
				type="button"
				onClick={() => void discover()}
				loading={fetching}
				disabled={
					saving ||
					(onDevice
						? !targetReady || device?.status !== "online"
						: !baseUrl.trim() || (needsKey && !apiKey.trim() && !isLoopbackProviderAddress(baseUrl)))
				}
			>
				{t("models.fetchModels")}
			</Button>
			{available.length ? (
				<ProviderModelPicker available={available} selected={selected} onChange={(ids) => setModels(ids.join(", "))} />
			) : null}
			{error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
			<Button type="submit" variant="primary" disabled={fetching} loading={saving}>
				{t("app.save")}
			</Button>
			<DiscardChangesDialog
				open={confirmPreset}
				body={t("models.discard")}
				onCancel={() => setConfirmPreset(false)}
				onConfirm={() => {
					setConfirmPreset(false);
					onChangePreset?.();
				}}
			/>
		</form>
	);
}
