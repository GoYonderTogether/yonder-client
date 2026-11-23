/**
 * The other device-model wire: the server sends a `device_model.request` to one session of this
 * device, the runtime here makes that discover or infer call from this machine, and posts numbered
 * result batches back over HTTP. A desktop that answers this wire runs it beside the local relay
 * (`device-model-runtime.tsx`), which serves the same endpoints to providers bound through the
 * device-local request. Both may run at once; the server routes each request by wire.
 */
import type { DeviceModelError, ServerEvent } from "@yonder/protocol";
import { useData } from "@yonder/ui-data";
import { useEffect } from "react";
import { deviceModelBatches } from "./device-model-batches.ts";
import { type DeviceModelEndpoint, invokeDeviceModel, onDeviceModelEndpointsChanged } from "./device-model-native.ts";
import { useLocalFilesContext } from "./local-files.ts";

const REQUEST_IDS = /^[a-z0-9_-]{1,100}$/iu;
const ENDPOINT_IDS = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const ERRORS = new Set<DeviceModelError>([
	"endpoint_unavailable",
	"model_not_found",
	"invalid_response",
	"timeout",
	"cancelled",
	"upstream_rejected",
]);
const MAX_LIFETIME_MS = 125_000;
const MAX_PENDING = 4;

type NativeFrame = { type: "data"; data: string } | { type: "done" };

/** One request narrowed from the server's event: only what the native command may receive. */
export interface DeviceModelWireRequest {
	requestId: string;
	endpointId: string;
	revision: number;
	expiresAtMs: number;
	operation: "discover" | "chat";
	body?: unknown;
}

export function deviceModelWireRequest(event: unknown): DeviceModelWireRequest | null {
	const value = event as Record<string, unknown> | null;
	if (value?.type !== "device_model.request") return null;
	const { requestId, endpointId, revision, expiresAt, operation, body, url, headers } = value;
	const expiresAtMs = typeof expiresAt === "string" ? Date.parse(expiresAt) : Number.NaN;
	if (
		typeof requestId !== "string" ||
		!REQUEST_IDS.test(requestId) ||
		typeof endpointId !== "string" ||
		!ENDPOINT_IDS.test(endpointId) ||
		typeof revision !== "number" ||
		!Number.isSafeInteger(revision) ||
		revision < 1 ||
		!Number.isSafeInteger(expiresAtMs) ||
		(operation !== "discover" && operation !== "chat") ||
		(operation === "discover" ? body !== undefined : !body || typeof body !== "object" || Array.isArray(body)) ||
		url !== undefined ||
		headers !== undefined
	)
		return null;
	return {
		requestId,
		endpointId,
		revision,
		expiresAtMs,
		operation,
		...(operation === "chat" ? { body } : {}),
	};
}

function reason(error: unknown): DeviceModelError {
	const code = error instanceof Error ? error.message : String(error);
	return ERRORS.has(code as DeviceModelError) ? (code as DeviceModelError) : "endpoint_unavailable";
}

/**
 * The device-model wire's runtime. It advertises the endpoints the native bridge knows as
 * `device_model.ready`, then answers each request by POSTing batches to the request's stream
 * route. Only the main window of a desktop device runs this.
 */
export function DeviceModelWireRuntime() {
	const context = useLocalFilesContext();
	const { client, realtime } = useData();
	useEffect(() => {
		if (!context) return;
		let active = true;
		let readiness = 0;
		let ready = new Map<string, number>();
		const pending = new Map<string, AbortController>();
		const nativeCancel = (requestId: string) =>
			void invokeDeviceModel("cancel", { context, requestId }).catch(() => {});
		const cancel = (requestId: string) => {
			pending.get(requestId)?.abort();
			pending.delete(requestId);
			nativeCancel(requestId);
		};
		const allCancel = () => {
			ready.clear();
			for (const requestId of pending.keys()) cancel(requestId);
		};
		const refresh = async () => {
			const version = ++readiness;
			if (!active || realtime.status !== "open") return;
			const endpoints = await invokeDeviceModel<DeviceModelEndpoint[]>("ready", { context }).catch(() => []);
			if (!active || realtime.status !== "open" || version !== readiness) return;
			ready = new Map(endpoints.map((entry) => [entry.endpointId, entry.revision]));
			const message = {
				type: "device_model.ready" as const,
				endpoints: endpoints.map(({ endpointId, revision, label, protocol }) => ({
					endpointId,
					revision,
					label,
					protocol: protocol ?? "openai",
				})),
			};
			realtime.send(message as Parameters<typeof realtime.send>[0]);
		};

		async function run(request: DeviceModelWireRequest) {
			const { requestId, endpointId, revision, operation, expiresAtMs } = request;
			if (!active || pending.has(requestId) || realtime.status !== "open") return;
			const path = `/v1/device-model/requests/${encodeURIComponent(requestId)}`;
			const controller = new AbortController();
			const { signal } = controller;
			const result = (body: unknown) => client.request(`${path}/result`, { body, signal });
			const remaining = expiresAtMs - Date.now();
			if (
				remaining <= 0 ||
				remaining > MAX_LIFETIME_MS ||
				ready.get(endpointId) !== revision ||
				pending.size >= MAX_PENDING
			) {
				await result({ error: remaining <= 0 ? "timeout" : "endpoint_unavailable" }).catch(() => {});
				return;
			}
			pending.set(requestId, controller);
			const stream = deviceModelBatches(
				async (body) => {
					await client.request(`${path}/stream`, { body, signal });
				},
				() => cancel(requestId),
			);
			const close = () => stream.stop();
			signal.addEventListener("abort", close, { once: true });
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				const { Channel } = await import("@tauri-apps/api/core");
				if (signal.aborted) return;
				let finishNative: (() => void) | undefined;
				const nativeDone = new Promise<void>((resolve) => {
					finishNative = resolve;
					signal.addEventListener("abort", () => resolve(), { once: true });
				});
				const channel = new Channel<NativeFrame>((frame) => {
					if (signal.aborted) return;
					if (frame.type === "data") stream.push(frame.data);
					if (frame.type === "done") finishNative?.();
				});
				timer = setTimeout(() => cancel(requestId), remaining);
				const response = await invokeDeviceModel<{ models?: string[] }>("execute", { context, request, channel });
				if (signal.aborted) return;
				if (operation === "discover") await result({ models: (response.models ?? []).map((id) => ({ id })) });
				else {
					await nativeDone;
					if (!signal.aborted) await stream.finish();
				}
			} catch (error) {
				if (signal.aborted) return;
				if (operation === "chat" && stream.hasStreamed()) await stream.finish(reason(error));
				else {
					stream.stop();
					await result({ error: reason(error) }).catch(() => {});
				}
			} finally {
				clearTimeout(timer);
				signal.removeEventListener("abort", close);
				stream.stop();
				if (pending.get(requestId) === controller) pending.delete(requestId);
			}
		}

		const disposeEvents = realtime.subscribeEvents((event: ServerEvent) => {
			const request = deviceModelWireRequest(event);
			if (request) void run(request);
			else if (event.type === "device_model.cancel" && pending.has(event.requestId)) cancel(event.requestId);
		});
		const disposeStatus = realtime.subscribe(() => {
			if (realtime.status === "open") void refresh();
			else allCancel();
		});
		const disposeLocal = onDeviceModelEndpointsChanged(() => void refresh());
		void refresh();
		return () => {
			active = false;
			allCancel();
			disposeEvents();
			disposeStatus();
			disposeLocal();
		};
	}, [context, client, realtime]);
	return null;
}
