/**
 * The device side of a Bot-written connector package (20261128-people-archive 03, 03b).
 *
 * The server dispatches `connector.custom.call` to one session of this device and expects
 * `connector.custom.result`; the same socket carries each polled `connector.event` batch and the
 * server's `connector.event.ack`. This runtime bridges those messages to the native commands:
 *
 * * it answers a call it cannot accept with a fixed reason before any entry runs, so the server
 *   settles the tool call instead of waiting out its own deadline;
 * * it forwards every native answer exactly once and never puts a package's own text on the wire;
 * * it tells the shell which connections poll, then asks for one poll per `everySeconds`;
 * * it passes each polled batch on as it arrives, and lets the shell keep the cursor until the ack.
 *
 * It renders nothing and runs only in the main window of a desktop build.
 */
import type { ClientEvent, ConnectorInstance, CustomCallRequest, ServerEvent } from "@yonder/protocol";
import { useConnectors, useData } from "@yonder/ui-data";
import { useEffect, useRef } from "react";
import { isTauri } from "./keychain.ts";
import { invokeLocalFiles, useLocalFilesContext } from "./local-files.ts";

/** The shell's answer to one call: a JSON value, or one of its fixed refusal codes. */
export type CustomCallReply = { ok: true; result: unknown } | { ok: false; error: string };

/** One package this session may poll, and the interval the shell read from its manifest. */
export interface CustomPollTarget {
	connectionId: string;
	revision: number;
}

/** What `custom_connector_poll` answers: connections that may poll and those blocked by a hash. */
export interface CustomPollReport {
	installed: { connectionId: string; revision: number; everySeconds: number | null }[];
	blocked: string[];
}

/** A polled batch the shell made ready; it goes on the socket as it stands. */
export type CustomEventNotice = Extract<ClientEvent, { type: "connector.event" }>;

/** What the shell emits when a ready report was written after a card's confirmation. */
export type CustomReadyNotice = Extract<ClientEvent, { type: "connector.custom.ready" }>;

export function customConnectorsSupported(): boolean {
	return isTauri() && !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Whether one `connector.custom.call` may reach the shell: it names a live connection of this
 * device whose connector id is `custom:<slug>`, at the revision that connection stands at, and it
 * has not expired. Anything else is answered `permission_denied` without running an entry; the
 * shell re-checks the same facts against its stored grant and the entry's hash.
 */
export function customCallEligible(
	call: CustomCallRequest,
	connections: readonly ConnectorInstance[],
	deviceId: string,
	now = Date.now(),
): boolean {
	const connection = connections.find((item) => item.id === call.connectionId && item.deviceId === deviceId);
	if (!connection?.connectorId.startsWith("custom:")) return false;
	if (connection.revision !== call.revision) return false;
	const expires = Date.parse(call.expiresAt);
	return Number.isFinite(expires) && now < expires;
}

/** The wire message for one shell answer. It never carries the package's entry hash or its slug. */
export function customResultMessage(
	callId: string,
	reply: CustomCallReply,
): Extract<ClientEvent, { type: "connector.custom.result" }> {
	return reply.ok
		? { type: "connector.custom.result", callId, ok: true, result: reply.result }
		: { type: "connector.custom.result", callId, ok: false, error: reply.error };
}

/** A native refusal's code; anything that is not an `error` code shape becomes a fixed generic. */
export function refusalCode(error: unknown): string {
	const text = error instanceof Error ? error.message : String(error);
	return /^[a-z][a-z_]{1,39}$/.test(text) ? text : "operation_failed";
}

/** A batch id: unique per poll, bounded, and made only of ids and a short salt. */
export function newBatchId(connectionId: string, now = Date.now()): string {
	const salt = Math.floor(Math.random() * 0x10000)
		.toString(16)
		.padStart(4, "0");
	return `${connectionId}-${now.toString(36)}-${salt}`;
}

/** Poll intervals the shell reported, keyed by connection id; `null` means "do not poll". */
export function pollIntervals(report: CustomPollReport): Map<string, number | null> {
	return new Map(report.installed.map((row) => [row.connectionId, row.everySeconds]));
}

export function CustomConnectorsRuntime(): null {
	const { realtime } = useData();
	const context = useLocalFilesContext();
	const connectors = useConnectors({ enabled: context !== null });
	const connectionsRef = useRef<readonly ConnectorInstance[]>([]);
	connectionsRef.current = connectors.data?.items ?? [];
	// Which custom connections exist, at which revision: a change is what re-reads the poll plan.
	const pollKey = (connectors.data?.items ?? [])
		.filter((item) => item.connectorId.startsWith("custom:"))
		.map((item) => `${item.id}:${item.revision}`)
		.sort()
		.join("\n");
	const deviceId = context?.deviceId;

	// biome-ignore lint/correctness/useExhaustiveDependencies: pollKey restarts the plan on a list change
	useEffect(() => {
		if (!context || !deviceId) return;
		let active = true;
		const running = new Set<string>();
		const timers = new Map<string, ReturnType<typeof setTimeout>>();
		const plan = new Map<string, number | null>();

		const invoke = (command: string, args: Record<string, unknown>) => invokeLocalFiles(command, { context, ...args });

		const collect = async (connectionId: string) => {
			if (!active || realtime.status !== "open") return;
			const batchId = newBatchId(connectionId);
			try {
				await invoke("custom_connector_collect", { connectionId, batchId });
			} catch {
				// A failed poll is silent by design: the next interval retries it, and nothing about
				// the package belongs in a notification.
			}
			schedule(connectionId);
		};

		const schedule = (connectionId: string) => {
			timers.get(connectionId) && clearTimeout(timers.get(connectionId));
			timers.delete(connectionId);
			if (!active) return;
			const every = plan.get(connectionId);
			if (!every) return;
			timers.set(
				connectionId,
				setTimeout(() => void collect(connectionId), every * 1_000),
			);
		};

		const sync = async () => {
			const targets: CustomPollTarget[] = connectionsRef.current
				.filter((item) => item.deviceId === deviceId && item.connectorId.startsWith("custom:"))
				.map((item) => ({ connectionId: item.id, revision: item.revision }));
			try {
				const report = await invokeLocalFiles<CustomPollReport>("custom_connector_poll", {
					context,
					connections: targets,
				});
				if (!active) return;
				const next = pollIntervals(report);
				for (const [connectionId, every] of plan) {
					if (next.get(connectionId) !== every) {
						if (timers.get(connectionId)) clearTimeout(timers.get(connectionId));
						timers.delete(connectionId);
					}
				}
				plan.clear();
				for (const [connectionId, every] of next) plan.set(connectionId, every);
				for (const connectionId of plan.keys()) if (!timers.has(connectionId)) schedule(connectionId);
			} catch {
				// The shell may not have the list yet; the next socket status change asks again.
			}
		};

		const call = async (request: CustomCallRequest) => {
			if (running.has(request.callId)) return;
			if (!customCallEligible(request, connectionsRef.current, deviceId)) {
				realtime.send(customResultMessage(request.callId, { ok: false, error: "permission_denied" }));
				return;
			}
			running.add(request.callId);
			try {
				const reply = await invokeLocalFiles<CustomCallReply>("custom_connector_execute", { context, call: request });
				if (active) realtime.send(customResultMessage(request.callId, reply));
			} catch (error) {
				if (active) realtime.send(customResultMessage(request.callId, { ok: false, error: refusalCode(error) }));
			} finally {
				running.delete(request.callId);
			}
		};

		const ack = (connectionId: string, batchId: string) => {
			void invoke("custom_connector_ack", { connectionId, batchId }).catch(() => {});
		};

		const stopEvents = realtime.subscribeEvents((event: ServerEvent) => {
			if (event.type === "connector.custom.call") void call(event.call);
			else if (event.type === "connector.event.ack") ack(event.connectionId, event.batchId);
		});

		let stopBatches: (() => void) | undefined;
		let stopReady: (() => void) | undefined;
		void import("@tauri-apps/api/event")
			.then(({ listen }) =>
				Promise.all([
					listen<CustomEventNotice>("custom-connector-event", ({ payload }) => {
						if (active && realtime.status === "open") realtime.send(payload);
					}),
					listen<CustomReadyNotice>("custom-connector-ready", ({ payload }) => {
						if (active && realtime.status === "open") realtime.send(payload);
					}),
				]),
			)
			.then(([batches, ready]) => {
				if (active) {
					stopBatches = batches;
					stopReady = ready;
				} else {
					batches();
					ready();
				}
			})
			.catch(() => {});

		// One socket status change is enough to re-read the plan: a reconnect may have missed an
		// ack, and a package added while this device was offline starts polling here too. A socket
		// that closed is the cancel signal for every call in flight: the server can no longer take
		// the result, so the entry must not keep running (03b's cancel rule).
		const stopStatus = realtime.subscribe(() => {
			if (!active) return;
			if (realtime.status === "open") void sync();
			else for (const callId of running) void invoke("custom_connector_cancel", { callId }).catch(() => {});
		});
		void sync();

		return () => {
			active = false;
			for (const callId of running) void invoke("custom_connector_cancel", { callId }).catch(() => {});
			for (const timer of timers.values()) clearTimeout(timer);
			timers.clear();
			stopEvents();
			stopStatus();
			stopBatches?.();
			stopReady?.();
		};
	}, [context, deviceId, realtime, pollKey]);

	return null;
}
