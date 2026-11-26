import type { DeviceSummary, Provider, ProviderModelMetadata, ProviderProtocol } from "@yonder/protocol";
import { Button, Field, PasswordField, SelectField, TextField } from "@yonder/ui-components";
import { DiscardChangesDialog } from "@yonder/ui-shell";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDeviceBinding } from "./provider-device-binding.ts";
import {
	CLOUD_PROVIDER,
	isHttpsAddress,
	isLocalProviderAddress,
	isLoopbackProviderAddress,
	localProviderBinding,
	type NativeProviderBinding,
	NEW_ENDPOINT,
	type ProviderAddFailure,
	providerDeviceLabel,
	type RegisterLocalProviderEndpoint,
} from "./provider-location.ts";
import {
	discoveredSlot,
	type ModelSlot,
	newSlot,
	PROTOCOL_EXAMPLES,
	PROTOCOL_OPTIONS,
	slotsFromProvider,
} from "./provider-model-slots.ts";
import { ProviderModelSlots } from "./provider-model-slots.tsx";
import { useProviderSubmit } from "./provider-submit.ts";

export interface ProviderPreset {
	id: string;
	name: string;
	baseUrl: string;
	models: string;
	keyUrl: string | null;
	protocol?: ProviderProtocol | "openai" | "anthropic";
	target?: NativeProviderBinding | undefined;
	note?: string | null;
	website?: string | null;
}

/** A preset predating the four-protocol release may name a wire by its old name. */
export function presetProtocol(
	value: ProviderProtocol | "openai" | "anthropic" | undefined,
): ProviderProtocol | undefined {
	if (!value) return undefined;
	if (value === "openai") return "openai-chat" as const;
	if (value === "anthropic") return "anthropic-messages" as const;
	return value;
}

/** Display names from the metadata map, so a slot can show one without the rest of the row. */
function normalise(value: string): string {
	return value.trim().replace(/\/+$/, "");
}

function namesFrom(metadata: Record<string, ProviderModelMetadata> | undefined): Record<string, string> | undefined {
	if (!metadata) return undefined;
	const names = Object.fromEntries(
		Object.entries(metadata)
			.filter(([, item]) => item.name)
			.map(([id, item]) => [id, item.name as string]),
	);
	return Object.keys(names).length ? names : undefined;
}

export function ProviderEditor({
	provider,
	preset,
	onChangePreset,
	onDirtyChange,
	onDone,
	onAddFailure,
	devices = [],
	registerEndpoint,
}: {
	provider?: Provider;
	preset?: ProviderPreset;
	onChangePreset?: () => void;
	onDirtyChange?: ((dirty: boolean) => void) | undefined;
	onDone: () => void;
	onAddFailure?: ProviderAddFailure | undefined;
	devices?: readonly DeviceSummary[] | undefined;
	registerEndpoint?: RegisterLocalProviderEndpoint | undefined;
}) {
	const { t, i18n } = useTranslation();
	const currentTarget = localProviderBinding(provider);
	const initialTarget = currentTarget ?? preset?.target;
	const [deviceId, setDeviceId] = useState(initialTarget?.deviceId ?? CLOUD_PROVIDER);
	const [endpointId, setEndpointId] = useState(initialTarget?.endpointId ?? "");
	const [localUrl, setLocalUrl] = useState("");
	const [localKey, setLocalKey] = useState("");
	const [protocol, setProtocol] = useState<ProviderProtocol>(
		presetProtocol(provider?.protocol) ?? presetProtocol(preset?.protocol) ?? "openai-chat",
	);
	const [name, setName] = useState(provider?.name ?? preset?.name ?? "");
	const [note, setNote] = useState(provider?.note ?? preset?.note ?? "");
	const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? preset?.baseUrl ?? "");
	const [slots, setSlots] = useState<ModelSlot[]>(() => {
		if (provider) return slotsFromProvider(provider.models, provider.metadata, namesFrom(provider.metadata));
		const ids = (preset?.models ?? "")
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean);
		return ids.length ? slotsFromProvider(ids, undefined, undefined) : [newSlot()];
	});
	const [apiKey, setApiKey] = useState("");
	const [replacing, setReplacing] = useState(!provider?.keyConfigured);
	const [error, setError] = useState<string | null>(null);
	const [available, setAvailable] = useState<string[]>([]);
	const [metadata, setMetadata] = useState<Record<string, ProviderModelMetadata>>({});
	const [confirmPreset, setConfirmPreset] = useState(false);
	const version = useRef(0);
	const nextVersion = () => ++version.current;

	const onDevice = deviceId !== CLOUD_PROVIDER;
	const device = onDevice ? devices.find(({ id }) => id === deviceId) : undefined;
	const supportsDesktop = (candidate: DeviceSummary) => ["macos", "windows", "linux"].includes(candidate.platform);
	const canRegister = !!(registerEndpoint && device?.current && supportsDesktop(device));
	const fixedDeviceProtocol = currentTarget ? presetProtocol(provider?.protocol) : undefined;
	const known = device?.modelEndpoints ?? [];
	const selectedProtocol = presetProtocol(known.find((item) => item.endpointId === endpointId)?.protocol);
	// An approved address speaks its registered wire; only a new address takes the form's choice.
	const deviceProtocol: ProviderProtocol = fixedDeviceProtocol ?? selectedProtocol ?? protocol;
	const binding = useDeviceBinding({
		deviceId,
		device,
		endpointId,
		localUrl,
		localKey,
		deviceProtocol,
		canRegister,
		canSetLocalKey: canRegister,
		registerEndpoint,
		version: version.current,
	});
	const { endpoint, addEndpoint } = binding;
	// Changing the destination invalidates the stored key: it was entered for another address or wire.
	const destinationChanged = Boolean(
		provider && (normalise(baseUrl) !== normalise(provider.baseUrl) || protocol !== provider.protocol),
	);
	const needsKey = !onDevice && (replacing || destinationChanged || Boolean(currentTarget));
	const canSetLocalKey = canRegister && (addEndpoint || Boolean(endpoint));
	const targetReady = Boolean(endpoint || (addEndpoint && isLocalProviderAddress(localUrl)));

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

	const original = useRef(JSON.stringify({ name, note, baseUrl, protocol, deviceId, endpointId, localUrl, slots }));
	const dirty =
		Boolean(apiKey || localKey) ||
		JSON.stringify({ name, note, baseUrl, protocol, deviceId, endpointId, localUrl, slots }) !== original.current;
	useEffect(() => {
		onDirtyChange?.(dirty);
	}, [dirty, onDirtyChange]);
	useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

	const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});
	const [testing, setTesting] = useState<string | null>(null);
	const { discover, save, test, fetching, saving } = useProviderSubmit({
		provider,
		baseUrl,
		deviceProtocol,
		slots,
		onAddFailure,
		onDone,
		setError,
		setAvailable,
		setMetadata,
		version,
		nextVersion,
	});

	// Discovery's answer fills the rows it names; a row the person is still typing is kept as it is.
	useEffect(() => {
		if (!available.length) return;
		setSlots((current) => {
			const named = new Set(available);
			const kept = current.filter((slot) => !slot.id.trim() || !named.has(slot.id.trim()));
			// Each discovered model arrives filled in: display name, window and levels from its family,
			// with whatever the endpoint declared taking precedence.
			const fresh = available.map((id) => discoveredSlot(id, metadata[id]));
			return fresh.length || kept.length ? [...fresh, ...kept] : current;
		});
	}, [available, metadata]);

	function resetDiscovery() {
		nextVersion();
		setAvailable([]);
		setMetadata({});
		setError(null);
		binding.reset();
	}
	/**
	 * A device change starts a new destination. An address the person typed on the cloud form carries
	 * over when it is a loopback address, because that is exactly the local gateway they meant.
	 */
	function chooseLocation(value: string) {
		const carried = isLocalProviderAddress(baseUrl) ? baseUrl : "";
		setDeviceId(value);
		setEndpointId("");
		setLocalKey("");
		setLocalUrl(carried);
		setBaseUrl(value === CLOUD_PROVIDER ? carried : "");
		resetDiscovery();
	}

	async function startDiscover() {
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
		const requestedVersion = version.current;
		const target = onDevice ? await binding.resolveTarget(requestedVersion).catch(() => null) : null;
		if (version.current !== requestedVersion) return;
		if (target && localKey) setLocalKey("");
		await discover(target, onDevice ? "" : apiKey.trim());
	}

	async function startSave(event: React.FormEvent) {
		event.preventDefault();
		if (!onDevice && isLoopbackProviderAddress(baseUrl)) {
			setError(t("models.chooseDevice"));
			return;
		}
		if (!name.trim()) {
			setError(t("models.invalid"));
			return;
		}
		if (onDevice && !targetReady) {
			setError(t("models.deviceUnavailable"));
			return;
		}
		if (!onDevice && !isHttpsAddress(baseUrl)) {
			setError(t("models.invalidUrl"));
			return;
		}
		if (needsKey && !apiKey.trim()) {
			setError(t("models.invalid"));
			return;
		}
		const target = onDevice ? await binding.resolveTarget(version.current).catch(() => null) : null;
		await save(target, apiKey.trim(), { name, note, protocol });
	}

	return (
		<form noValidate onSubmit={(event) => void startSave(event)} className="flex flex-col gap-[var(--spacing-4)]">
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

			{/* Name and note read as one line: both describe the provider, neither is an address. */}
			<div className="grid gap-[var(--spacing-2)] sm:grid-cols-2">
				<TextField
					label={t("models.name")}
					value={name}
					onChange={(event) => setName(event.target.value)}
					required
					requiredMark
					disabled={saving}
				/>
				<TextField
					label={t("models.note")}
					value={note}
					onChange={(event) => setNote(event.target.value)}
					placeholder={t("models.noteHint")}
					disabled={saving}
				/>
			</div>

			{/* Where the call runs and where it is sent belong together: one address, two origins. */}
			<div className="grid gap-[var(--spacing-2)] sm:grid-cols-2">
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
									resetDiscovery();
								}}
								placeholder={PROTOCOL_EXAMPLES[deviceProtocol].placeholder}
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
						placeholder={PROTOCOL_EXAMPLES[protocol].placeholder}
						hint={t("models.baseUrlHint", { path: PROTOCOL_EXAMPLES[protocol].path })}
						required
						requiredMark
						disabled={saving}
					/>
				)}
			</div>

			<SelectField
				label={t("models.protocol")}
				value={onDevice ? deviceProtocol : protocol}
				disabled={saving || (onDevice && (Boolean(endpoint) || Boolean(fixedDeviceProtocol)))}
				onChange={(value) => {
					setProtocol(value as ProviderProtocol);
					setLocalKey("");
					resetDiscovery();
				}}
				hint={onDevice ? t("models.deviceProtocolHint") : t("models.protocolHint")}
				options={PROTOCOL_OPTIONS.map((value) => ({ value, label: t(`models.protocolName.${value}`) }))}
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

			<div className="flex flex-col gap-[var(--spacing-2)]">
				<div className="flex items-center justify-between gap-[var(--spacing-2)]">
					<span className="text-caption text-[var(--color-text-secondary)]">{t("models.modelsTitle")}</span>
					{/* Discovery is a small action beside the table, not the form's main step. */}
					<Button
						type="button"
						variant="link"
						size="sm"
						onClick={() => void startDiscover()}
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
				</div>
				<ProviderModelSlots
					slots={slots}
					available={available}
					disabled={saving}
					testing={testing}
					errorOf={(key) => results[key]}
					onChange={(next) => {
						setSlots(next);
						nextVersion();
					}}
					onTest={(slot) => {
						const model = slot.id.trim();
						if (!model) return;
						setTesting(slot.key);
						void test(model).then((result) => {
							setResults((current) => ({ ...current, [slot.key]: result }));
							setTesting(null);
						});
					}}
				/>
			</div>

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
