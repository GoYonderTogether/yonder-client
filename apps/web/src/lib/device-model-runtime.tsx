import { useData } from "@yonder/ui-data";
import { useEffect } from "react";
import { type DeviceModelEndpoint, invokeDeviceModel, onDeviceModelEndpointsChanged } from "./device-model-native.ts";
import { deviceModelRelay } from "./device-model-stream.ts";
import { useLocalFilesContext } from "./local-files.ts";

const requestIds = /^[a-z0-9_-]{1,100}$/iu;
const mode = "device-local";
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
	protocol?: "anthropic";
	body?: unknown;
}

export function deviceModelRequest(event: unknown): Request | null {
	const value = event as Record<string, unknown> | null;
	if (
		value?.type !== "provider.relay.request" ||
		value.mode !== mode ||
		"url" in value ||
		"headers" in value ||
		"apiKey" in value
	)
		return null;
	const { relayId: requestId, endpointId, revision, expiresAt, operation, protocol, body } = value;
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
		(protocol !== "openai" && protocol !== "anthropic") ||
		(operation === "discover" ? body !== undefined : !body || typeof body !== "object" || Array.isArray(body))
	)
		return null;
	// The native command never receives any server-supplied URL or headers.
	return {
		requestId,
		endpointId,
		revision,
		expiresAtMs,
		operation,
		...(protocol === "anthropic" ? { protocol } : {}),
		...(operation === "chat" ? { body } : {}),
	};
}

function reason(error: unknown): string {
	const code = error instanceof Error ? error.message : String(error);
	return errors.has(code) ? code : "endpoint_unavailable";
}

export function DeviceModelRuntime() {
	const context = useLocalFilesContext();
	const { realtime } = useData();
	useEffect(() => {
		if (!context) return;
		let active = true;
		let readiness = 0;
		let ready = new Map<string, DeviceModelEndpoint>();
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
		const send = (message: unknown) => {
			try {
				return realtime.send(message as Parameters<typeof realtime.send>[0]);
			} catch {
				return false;
			}
		};
		const refresh = async () => {
			const version = ++readiness;
			if (!active || realtime.status !== "open" || !(await activate)) return;
			const endpoints = await invokeDeviceModel<DeviceModelEndpoint[]>("ready", { context }).catch(() => []);
			if (!active || realtime.status !== "open" || version !== readiness) return;
			ready = new Map(endpoints.map((entry) => [entry.endpointId, entry]));
			send({
				type: "provider.relay.ready",
				endpoints: endpoints.map(({ endpointId, revision, label, protocol }) => ({
					endpointId,
					revision,
					label,
					protocol: protocol ?? "openai",
				})),
			});
		};

		async function model(request: Request) {
			const { requestId, endpointId, revision, operation, protocol, expiresAtMs } = request;
			if (!active || pending.has(requestId) || realtime.status !== "open") return;
			const controller = new AbortController();
			const { signal } = controller;
			const relay = deviceModelRelay(requestId, operation, protocol ?? "openai", send);
			const remaining = expiresAtMs - Date.now();
			const endpoint = ready.get(endpointId);
			if (
				remaining <= 0 ||
				remaining > 125_000 ||
				endpoint?.revision !== revision ||
				endpoint.protocol !== protocol ||
				pending.size >= 4
			) {
				relay.fail(remaining <= 0 ? "timeout" : "endpoint_unavailable");
				return;
			}
			pending.set(requestId, controller);
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
					if (operation === "chat" && frame.type === "data" && !relay.push(frame.data)) cancel(requestId);
					if (frame.type === "done") finishNative?.();
				});
				timer = setTimeout(() => {
					relay.fail("timeout");
					cancel(requestId);
				}, remaining);
				const response = await invokeDeviceModel<{ models?: string[] }>("execute", { context, request, channel });
				if (signal.aborted) return;
				if (operation === "discover") relay.finishDiscovery(response.models ?? []);
				else {
					await nativeDone;
					if (!signal.aborted) relay.finishChat();
				}
			} catch (error) {
				if (!signal.aborted) relay.fail(reason(error));
			} finally {
				clearTimeout(timer);
				if (pending.get(requestId) === controller) pending.delete(requestId);
			}
		}

		const disposeEvents = realtime.subscribeEvents((event: unknown) => {
			const request = deviceModelRequest(event);
			if (request) void model(request);
			else {
				const cancelEvent = event as { type?: string; mode?: unknown; relayId?: unknown } | null;
				if (
					cancelEvent?.type === "provider.relay.cancel" &&
					cancelEvent.mode === mode &&
					typeof cancelEvent.relayId === "string" &&
					pending.has(cancelEvent.relayId)
				)
					cancel(cancelEvent.relayId);
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
	}, [context, realtime]);
	return null;
}
