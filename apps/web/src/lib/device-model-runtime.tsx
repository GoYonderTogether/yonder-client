import type { ClientEvent, DeviceModelEndpoint, DeviceModelProtocol, ServerEvent } from "@yonder/protocol";
import { useData, useProviders } from "@yonder/ui-data";
import { useEffect, useMemo, useRef } from "react";
import {
	chunkMessage,
	type DeviceLocalRequest,
	deviceLocalRequest,
	deviceModelError,
	discoveryBody,
	endMessage,
	headMessage,
	MAX_DISCOVER_BYTES,
	MAX_LIFETIME_MS,
	OPENAI_TERMINAL,
	readyEndpoints,
	readyMessage,
} from "./device-local-wire.ts";
import { invokeDeviceModel, onDeviceModelEndpointsChanged } from "./device-model-native.ts";
import { deviceModelStream } from "./device-model-stream.ts";
import { useLocalFilesContext } from "./local-files.ts";

/** Native commands run one at a time so activate/reset cannot race a newer session. */
let nativeLifecycle = Promise.resolve();
function nativeLifetime(name: "activate" | "reset", context: NonNullable<ReturnType<typeof useLocalFilesContext>>) {
	const next = nativeLifecycle.then(() => invokeDeviceModel<void>(name, { context }));
	nativeLifecycle = next.catch(() => {});
	return next;
}

/** Both wires run in this window; the bridge is activated once, whichever runtime starts first. */
function activate(context: NonNullable<ReturnType<typeof useLocalFilesContext>>) {
	return nativeLifetime("activate", context).then(
		() => true,
		() => false,
	);
}

const byteLength = (value: string) => new TextEncoder().encode(value).length;

/** The OpenAI-shaped stream ends with `[DONE]`; an Anthropic one ends with a part the server sees itself. */
function openAiTerminal(protocol: DeviceModelProtocol, body: unknown): string | undefined {
	if (protocol !== "openai") return undefined;
	return (body as { stream?: unknown } | null)?.stream === true ? OPENAI_TERMINAL : undefined;
}

/**
 * The device side of a device-local provider call. The server sends one `provider.relay.request`
 * with `mode: "device-local"` to a session of the bound device; this runtime runs it here — the
 * only machine the endpoint is reachable from — and answers with a head, ordered parts and an end.
 *
 * The request names an approved endpoint, never a URL or a key, so nothing the server sends can
 * point this device at an address the owner did not approve. Only the main window of a desktop
 * device runs this.
 */
export function DeviceModelRuntime() {
	const context = useLocalFilesContext();
	const { realtime } = useData();
	const providers = useProviders({ enabled: context !== null });
	/**
	 * Endpoint id to wire protocol: the only endpoints this account has pointed at this device. The
	 * string form is what the effect below compares, so a re-render with the same bindings is free.
	 */
	const bound = useMemo(
		() =>
			(providers.data?.items ?? [])
				.filter((provider) => provider.target?.deviceId === context?.deviceId)
				.map((provider) => [provider.target?.endpointId ?? "", provider.protocol] as const)
				.filter(([endpointId]) => endpointId)
				.sort(),
		[providers.data, context?.deviceId],
	);
	const boundKey = bound.map(([endpointId, protocol]) => `${endpointId}:${protocol}`).join("\n");
	const protocols = useRef(new Map<string, DeviceModelProtocol>());

	// `bound` is compared through `boundKey`; its array identity changes on every render.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		if (!context) return;
		protocols.current = new Map(bound);
		let active = true;
		let readiness = 0;
		let announced = "";
		/** Calls running here, by relay id, with the way to stop one. */
		const running = new Map<string, () => void>();
		const send = (message: ClientEvent) => realtime.send(message as Parameters<typeof realtime.send>[0]);

		/** Announce the endpoints a provider of this account points at, and only those. */
		const refresh = async () => {
			const version = ++readiness;
			if (!active || realtime.status !== "open" || !(await activate(context))) return;
			const known = await invokeDeviceModel<DeviceModelEndpoint[]>("ready", { context }).catch(() => []);
			if (!active || version !== readiness) return;
			const endpoints = readyEndpoints(known).filter(({ endpointId }) => protocols.current.has(endpointId));
			const wire = JSON.stringify(endpoints);
			if (wire === announced) return;
			announced = wire;
			send(readyMessage(endpoints));
		};

		async function model(request: DeviceLocalRequest) {
			const { relayId, endpointId, expiresAt, operation, protocol } = request;
			if (!active || running.has(relayId) || realtime.status !== "open" || running.size >= 4) return;
			const remaining = Date.parse(expiresAt) - Date.now();
			if (remaining <= 0 || remaining > MAX_LIFETIME_MS || protocols.current.get(endpointId) !== protocol) {
				send(endMessage(relayId, 0, remaining <= 0 ? "timeout" : "endpoint_unavailable"));
				return;
			}
			let ended = false;
			let releaseHead!: () => void;
			/** The server drops a chunk that arrives before the head, so parts wait for it. */
			const headed = new Promise<void>((resolve) => {
				releaseHead = resolve;
			});
			const stream = deviceModelStream(
				async (seq, part) => {
					await headed;
					if (byteLength(part) > 65_536) throw new Error("invalid_response");
					send(chunkMessage(relayId, seq, part));
				},
				() => finish("invalid_response"),
			);
			const finish = (error?: ReturnType<typeof deviceModelError>) => {
				if (ended) return;
				ended = true;
				send(endMessage(relayId, stream.count(), error));
				running.delete(relayId);
				stream.stop();
			};
			const head = (contentType: "application/json" | "text/event-stream") => {
				send(headMessage(relayId, contentType));
				releaseHead();
			};
			running.set(relayId, () => {
				ended = true;
				releaseHead();
				stream.stop();
				running.delete(relayId);
				// The server already forgot this call; stopping the work here is all that is left.
				void invokeDeviceModel("cancel", { context, relayId }).catch(() => {});
			});
			try {
				const { Channel } = await import("@tauri-apps/api/core");
				if (!active) return;
				let finishNative: (() => void) | undefined;
				const nativeDone = new Promise<void>((resolve) => {
					finishNative = resolve;
				});
				const channel = new Channel<{ type: "data"; data: string } | { type: "done" }>((frame) => {
					if (!active || ended) return;
					if (frame.type === "data") stream.push(frame.data);
					if (frame.type === "done") finishNative?.();
				});
				const response = await invokeDeviceModel<{ models?: string[] }>("execute", {
					context,
					request: { ...request, expiresAtMs: Date.parse(expiresAt) },
					channel,
				});
				if (!active || ended) return;
				if (operation === "discover") {
					const body = discoveryBody(response.models ?? []);
					if (byteLength(body) > MAX_DISCOVER_BYTES) return finish("invalid_response");
					head("application/json");
					return (await stream.finish(body)) === null ? finish("invalid_response") : finish();
				}
				await nativeDone;
				if (!active || ended) return;
				head("text/event-stream");
				if ((await stream.finish(openAiTerminal(protocol, request.body))) === null) return finish("invalid_response");
				finish();
			} catch (error) {
				if (active && !ended) finish(deviceModelError(error));
			} finally {
				releaseHead();
				running.delete(relayId);
			}
		}

		const disposeEvents = realtime.subscribeEvents((event: ServerEvent) => {
			const request = deviceLocalRequest(event);
			if (request) void model(request);
			else {
				const cancel = event as { type?: string; relayId?: unknown; mode?: unknown } | null;
				if (cancel?.type === "provider.relay.cancel" && cancel.mode === "device-local")
					if (typeof cancel.relayId === "string") running.get(cancel.relayId)?.();
			}
		});
		const disposeStatus = realtime.subscribe(() => {
			if (realtime.status === "open") void refresh();
			else {
				for (const stop of running.values()) stop();
				running.clear();
				announced = "";
			}
		});
		const disposeLocal = onDeviceModelEndpointsChanged(() => void refresh());
		void refresh();
		return () => {
			active = false;
			for (const stop of running.values()) stop();
			running.clear();
			disposeEvents();
			disposeStatus();
			disposeLocal();
		};
	}, [context, realtime, boundKey]);
	return null;
}
