import type { Provider, ProviderModelMetadata, ProviderProtocol } from "@yonder/protocol";
import { useProviderActions } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { NativeProviderBinding, ProviderAddFailure } from "./provider-location.ts";
import { completeSlots, type ModelSlot, saveMetadata } from "./provider-model-slots.ts";

/**
 * Discover and save, the two calls that touch the network.
 *
 * Both share one rule: a call that started before the form changed is discarded, because its
 * answer would describe a provider the form no longer shows. The version counter is that guard,
 * and every field change bumps it.
 */
export function useProviderSubmit(options: {
	provider: Provider | undefined;
	/** The cloud request address as typed. A device provider has none: it is registered instead. */
	baseUrl: string;
	deviceProtocol: ProviderProtocol;
	slots: readonly ModelSlot[];
	onAddFailure?: ProviderAddFailure | undefined;
	onDone: () => void;
	setError: (message: string | null) => void;
	setAvailable: (models: string[]) => void;
	setMetadata: (metadata: Record<string, ProviderModelMetadata>) => void;
	version: { current: number };
	nextVersion: () => number;
}) {
	const { t } = useTranslation();
	const actions = useProviderActions();
	const setError = options.setError;
	const [fetching, setFetching] = useState(false);
	const [saving, setSaving] = useState(false);
	const writing = { current: false };

	/**
	 * Discover needs only the address and key, not the model rows: it is how those rows are filled.
	 *
	 * A second pass while one is in flight runs after it rather than being dropped: the person may
	 * have just corrected the key, and the form's answer must be for what is on screen now.
	 */
	let queued: Promise<void> | undefined;

	async function discover(target: NativeProviderBinding | null, key: string): Promise<void> {
		if (writing.current) {
			await queued;
			return discover(target, key);
		}
		writing.current = true;
		const run = (async () => {
			setFetching(true);
			setError(null);
			const startedAt = performance.now();
			const version = options.nextVersion();
			try {
				const result = await actions.discoverModels(
					target
						? { origin: "device", ...target, protocol: options.deviceProtocol }
						: {
								baseUrl: normalizeWallet(options.baseUrl),
								protocol: options.deviceProtocol,
								...(key ? { apiKey: key } : options.provider ? { providerId: options.provider.id } : {}),
							},
				);
				if (version !== options.version.current) return;
				options.setAvailable(result.models);
				options.setMetadata(result.metadata ?? {});
				if (!result.models.length) setError(t("models.fetchFailed"));
			} catch (cause) {
				if (version === options.version.current) {
					setError(t("models.fetchFailed"));
					options.onAddFailure?.("discover", cause, startedAt);
				}
			} finally {
				// The loading flag is cleared whatever happened: a run overtaken by a newer one must not
				// leave the button disabled for good, which is what a guarded clear did when the person
				// typed in the key field while the request was in flight (2026-11-26).
				setFetching(false);
			}
		})();
		queued = run;
		await run;
		writing.current = false;
	}

	async function save(
		target: NativeProviderBinding | null,
		key: string,
		values: {
			name: string;
			note: string;
			protocol: ProviderProtocol;
		},
	) {
		const startedAt = performance.now();
		const version = options.nextVersion();
		const slots = completeSlots(options.slots);
		if (!slots.length) {
			setError(t("models.invalid"));
			return false;
		}
		let saved = false;
		writing.current = true;
		setSaving(true);
		options.setError(null);
		try {
			await actions.save(options.provider?.id, {
				name: values.name.trim(),
				note: values.note.trim() || null,
				models: slots.map((slot) => slot.id.trim()),
				metadata: saveMetadata(slots),
				...(target
					? { origin: "device", ...target, protocol: options.deviceProtocol }
					: { baseUrl: normalizeWallet(options.baseUrl), protocol: values.protocol, ...(key ? { apiKey: key } : {}) }),
			});
			saved = true;
			options.onDone();
		} catch (cause) {
			setSaving(false);
			options.setError(t("models.saveFailed"));
			if (!saved && version === options.version.current) options.onAddFailure?.("save", cause, startedAt);
		} finally {
			writing.current = false;
			if (saved) setSaving(false);
		}
		return saved;
	}

	/**
	 * One short real call through one saved model. Only a saved provider can be tested: the endpoint
	 * is reached with the stored key, so an unsaved row has nothing to send yet.
	 */
	async function test(modelId: string): Promise<{ ok: boolean; message: string }> {
		if (!options.provider) return { ok: false, message: t("models.testSaveFirst") };
		try {
			const { ok } = await actions.test.mutateAsync({ id: options.provider.id, model: modelId });
			return { ok, message: ok ? "" : t("models.testFailed") };
		} catch (cause) {
			return { ok: false, message: cause instanceof Error ? cause.message : t("models.testFailed") };
		}
	}

	return { discover, save, test, fetching, saving };
}

/**
 * A cloud address is stored without the version segment the adapter appends itself, so an address
 * copied straight from a provider's documentation does not become `/v1/v1/chat/completions`.
 */
export function normalizeWallet(value: string): string {
	return value.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}
