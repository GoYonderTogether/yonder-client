import { useData } from "@yonder/ui-data";
import { useEffect } from "react";
import { type DeviceModelEndpoint, invokeDeviceModel, onDeviceModelEndpointsChanged } from "./device-model-native.ts";
import { deviceModelStream } from "./device-model-stream.ts";
import { useLocalFilesContext } from "./local-files.ts";

const requestIds = /^[a-z0-9_-]{1,100}$/iu;
const endpointIds = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const errors = new Set([
	"endpoint_unavailable",
	"model_not_found",
	"invalid_response",
	"timeout",
	"cancelled",
	"upstream_rejected",
]);

let nativeLifecycle = Promise.resolve();
function nativeLifetime(name: "activate" | "reset", context: NonNullable<ReturnType<typeof useLocalFilesContext>>) {
	const next = nativeLifecycle.then(() => invokeDeviceModel<void>(name, { context }));
	nativeLifecycle = next.catch(() => {});
	return next;
}

type NativeFrame = { type: "data"; data: string } | { type: "done" };
interface Request {
	requestId: string;
	endpointId: string;
	revision: number;
	expiresAtMs: number;
	operation: "discover" | "chat";
	body?: unknown;
}

export function deviceModelRequest(event: unknown): Request | null {
	const value = event as Record<string, unknown> | null;
	if (value?.type !== "device_model.request") return null;
	const { requestId, endpointId, revision, expiresAt, operation, body } = value;
	const expiresAtMs = typeof expiresAt === "string" ? Date.parse(expiresAt) : NaN;
	if (
		typeof requestId !== "string" ||
		!requestIds.test(requestId) ||
		typeof endpointId !== "string" ||
		!endpointIds.test(endpointId) ||
		typeof revision !== "number" ||
		!Number.isSafeInteger(revision) ||
		revision < 1 ||
		typeof expiresAtMs !== "number" ||
		!Number.isSafeInteger(expiresAtMs) ||
		(operation !== "discover" && operation !== "chat") ||
		(operation === "discover" ? body !== undefined : !body || typeof body !== "object" || Array.isArray(body))
	)
		return null;
	// The native command never receives any server-supplied URL or headers.
	return { requestId, endpointId, revision, expiresAtMs, operation, ...(operation === "chat" ? { body } : {}) };
}

function reason(error: unknown): string {
	const code = error instanceof Error ? error.message : String(error);
	return errors.has(code) ? code : "endpoint_unavailable";
}

export function DeviceModelRuntime() {
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
		const activate = nativeLifetime("activate", context).then(
			() => true,
			() => false,
		);
		const refresh = async () => {
			const version = ++readiness;
			if (!active || realtime.status !== "open" || !(await activate)) return;
			const endpoints = await invokeDeviceModel<DeviceModelEndpoint[]>("ready", { context }).catch(() => []);
			if (!active || realtime.status !== "open" || version !== readiness) return;
			ready = new Map(endpoints.map((entry) => [entry.endpointId, entry.revision]));
			const message = { type: "device_model.ready", endpoints };
			realtime.send(message as unknown as Parameters<typeof realtime.send>[0]);
		};

		async function model(request: Request) {
			const { requestId, endpointId, revision, operation, expiresAtMs } = request;
			if (!active || pending.has(requestId) || realtime.status !== "open") return;
			const path = `/v1/device-model/requests/${encodeURIComponent(requestId)}`;
			const controller = new AbortController();
			const { signal } = controller;
			const result = (body: unknown) => client.request(`${path}/result`, { body, signal });
			const remaining = expiresAtMs - Date.now();
			if (remaining <= 0 || remaining > 125_000 || ready.get(endpointId) !== revision || pending.size >= 4) {
				await result({ error: remaining <= 0 ? "timeout" : "endpoint_unavailable" }).catch(() => {});
				return;
			}
			pending.set(requestId, controller);
			const stream = deviceModelStream(
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

		const disposeEvents = realtime.subscribeEvents((event: unknown) => {
			const request = deviceModelRequest(event);
			if (request) void model(request);
			else {
				const cancelEvent = event as { type?: string; requestId?: unknown } | null;
				if (
					cancelEvent?.type === "device_model.cancel" &&
					typeof cancelEvent.requestId === "string" &&
					pending.has(cancelEvent.requestId)
				)
					cancel(cancelEvent.requestId);
			}
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
			void nativeLifetime("reset", context).catch(() => {});
		};
	}, [context, client, realtime]);
	return null;
}
