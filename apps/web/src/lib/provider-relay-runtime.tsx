/**
 * The device side of a relayed provider call. The server sends `provider.relay.request` to one
 * session of this device; this runtime has the desktop shell make the request from this machine
 * and passes what comes back on as `provider.relay.head`, `provider.relay.chunk` and
 * `provider.relay.end`, so a model's tokens travel as they are produced.
 *
 * The shell will only dial addresses this device was told to bind, and the runtime binds exactly the
 * base addresses of the providers the account has pointed at this device. Only the main window of a
 * desktop device runs this.
 */
import type { ClientEvent, ServerEvent } from "@yonder/protocol";
import { useData, useProviders } from "@yonder/ui-data";
import { useEffect, useMemo, useRef } from "react";
import { isTauri } from "./keychain.ts";
import { useLocalFilesContext } from "./local-files.ts";

type RelayEvent =
	| { kind: "head"; status: number; contentType: string | null }
	| { kind: "chunk"; part: string }
	| { kind: "end"; error: string | null };

type LegacyRelayRequest = Extract<ServerEvent, { type: "provider.relay.request"; url: string }>;

// Device-local mode is executed through its profile and Keychain, never the raw URL relay.
export function isLegacyRelayRequest(event: ServerEvent): event is LegacyRelayRequest {
	return event.type === "provider.relay.request" && !("mode" in event);
}

export function providerRelaySupported(): boolean {
	return isTauri() && !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/** Server message for one shell event; pure so it can be tested without a shell. */
export function relayMessage(relayId: string, event: RelayEvent): ClientEvent {
	if (event.kind === "head")
		return {
			type: "provider.relay.head",
			relayId,
			status: event.status,
			...(event.contentType ? { contentType: event.contentType } : {}),
		};
	if (event.kind === "chunk") return { type: "provider.relay.chunk", relayId, part: event.part };
	return { type: "provider.relay.end", relayId, ...(event.error ? { error: event.error } : {}) };
}

export function ProviderRelayRuntime(): null {
	const { realtime } = useData();
	const context = useLocalFilesContext();
	const providers = useProviders({ enabled: context !== null });
	const bound = useMemo(
		() =>
			(providers.data?.items ?? [])
				.filter(
					(provider) => provider.origin === "device" && provider.deviceId === context?.deviceId && !provider.endpointId,
				)
				.map((provider) => provider.baseUrl)
				.sort(),
		[providers.data, context?.deviceId],
	);
	const boundKey = bound.join("\n");
	const active = useRef(new Set<string>());

	// Tell the shell which addresses it may dial, whenever the set changes.
	useEffect(() => {
		let current = true;
		void (async () => {
			const { invoke } = await import("@tauri-apps/api/core");
			if (current) await invoke("provider_relay_bind", { baseUrls: boundKey ? boundKey.split("\n") : [] });
		})().catch(() => {});
		return () => {
			current = false;
		};
	}, [boundKey]);

	useEffect(() => {
		const run = async (event: LegacyRelayRequest) => {
			const { relayId } = event;
			active.current.add(relayId);
			const send = (message: ClientEvent) => {
				if (active.current.has(relayId)) realtime.send(message);
			};
			try {
				const { invoke, Channel } = await import("@tauri-apps/api/core");
				const channel = new Channel<RelayEvent>();
				channel.onmessage = (shellEvent) => {
					send(relayMessage(relayId, shellEvent));
					if (shellEvent.kind === "end") active.current.delete(relayId);
				};
				await invoke("provider_relay_execute", {
					request: {
						relayId,
						method: event.body === "" ? "GET" : "POST",
						url: event.url,
						headers: Object.entries(event.headers).map(([name, value]) => ({ name, value })),
						body: event.body,
					},
					onEvent: channel,
				});
			} catch (error) {
				send(relayMessage(relayId, { kind: "end", error: error instanceof Error ? error.message : String(error) }));
				active.current.delete(relayId);
			}
		};
		const stop = realtime.subscribeEvents((event: ServerEvent) => {
			if (isLegacyRelayRequest(event)) void run(event);
			else if (event.type === "provider.relay.cancel" && event.mode === undefined) {
				active.current.delete(event.relayId);
				void import("@tauri-apps/api/core").then(({ invoke }) =>
					invoke("provider_relay_cancel", { relayId: event.relayId }).catch(() => {}),
				);
			}
		});
		return () => {
			stop();
			active.current.clear();
		};
	}, [realtime]);
	return null;
}
