import type { ConnectorCommand, ConnectorCommandResult, ConnectorGrant, Conversation } from "@yonder/protocol";
import { keys, useConnectors, useData, useDataQueryClient } from "@yonder/ui-data";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { invokeLocalFiles, onLocalFilesChanged, useLocalFilesContext } from "./local-files.ts";
import { beginTrayConnectorWork } from "./tray-bridge.ts";

type PendingCommand = { cancelled: boolean; tray?: ReturnType<typeof beginTrayConnectorWork> };

const ERRORS = new Set([
	"permission_denied",
	"not_found",
	"path_invalid",
	"unsupported_file",
	"too_large",
	"disconnected",
	"cancelled",
	"read_failed",
	"conflict",
	"already_exists",
	"operation_failed",
]);

/** A native refusal is the real error code; anything else is a write that did not finish. */
function grantError(error: unknown): string {
	const code = error instanceof Error ? error.message : String(error);
	return ERRORS.has(code) ? code : "operation_failed";
}

/**
 * The main desktop webview provides local tools over its existing account socket. It also stores
 * the grants a `connector.grant.request` names: the user's tap on the card was the consent, so the
 * device writes its local grant library and reports readiness without a second Yonder dialog.
 *
 * The sockets, the writes and the readiness reports live as long as the account, device and session.
 * The connection list is data they read, never part of that lifetime: a `connectors.changed` refresh
 * arrives while a grant is being written, and must neither restart the handlers nor stop the rest of
 * that dispatch.
 */
export function LocalFilesRuntime() {
	const { t } = useTranslation();
	const context = useLocalFilesContext();
	const { api, realtime } = useData();
	const query = useDataQueryClient();
	const activityLabel = useRef(t);
	activityLabel.current = t;
	const connectors = useConnectors({ enabled: context !== null });
	// `null` means the list has not loaded yet, which is not the same as having no connections.
	const connections = useMemo<{ id: string; revision: number }[] | null>(
		() =>
			connectors.data
				? connectors.data.items
						.filter((connection) => connection.deviceId === context?.deviceId)
						.map((connection) => ({ id: connection.id, revision: connection.revision }))
				: null,
		[connectors.data, context?.deviceId],
	);
	const connectionsRef = useRef(connections);
	connectionsRef.current = connections;
	const listKey = connections
		? connections
				.map((connection) => `${connection.id}:${connection.revision}`)
				.sort()
				.join("\n")
		: null;
	/** Set by the effect below: answer a list that changed since the last one answered for. */
	const syncListRef = useRef<((listed: { id: string; revision: number }[]) => void) | null>(null);
	const answeredKey = useRef<string | null>(null);
	useEffect(() => {
		if (connections === null || listKey === null || listKey === answeredKey.current) return;
		answeredKey.current = listKey;
		syncListRef.current?.(connections);
	}, [connections, listKey]);
	useEffect(() => {
		if (!context) return;
		let active = true;
		const pending = new Map<string, PendingCommand>();
		// Grants this runtime stored that the server's list has not shown yet. The list arrives a moment
		// later; a grant written now is reported ready without waiting for it.
		const written = new Map<string, number>();
		let trayConversations: Promise<{ items: Conversation[] }> | undefined;
		const knownConnections = () =>
			[
				...new Map([...(connectionsRef.current ?? []).map((item) => [item.id, item.revision] as const), ...written]),
			].map(([id, revision]) => ({ id, revision }));
		const eligible = (connectionId: string) =>
			written.has(connectionId) || (connectionsRef.current ?? []).some((item) => item.id === connectionId);
		const failRequest = (requestId: string, error: string, dispatchSeq?: number) =>
			api.failConnectorRequest(requestId, error, dispatchSeq).catch(() => {});
		/**
		 * Tell the server which connections this device can serve. A failure is reported twice: an
		 * empty list, because nothing can be vouched for, and a failure receipt for the request that
		 * asked, carrying the real code, so the card does not wait for a grant that will never arrive.
		 */
		const refreshReady = async (requestId?: string, dispatchSeq?: number) => {
			if (!active || realtime.status !== "open") return;
			// Before the list has loaded nothing can be vouched for; an empty answer would mark this
			// device's existing connections offline. Grants written by this runtime are known already.
			if (connectionsRef.current === null && written.size === 0) return;
			try {
				await invokeLocalFiles("local_files_activate", { context });
				if (!active) return;
				const ready = await invokeLocalFiles<{ id: string; revision: number }[]>("local_files_ready", {
					context,
					connections: knownConnections(),
				});
				if (active) realtime.send({ type: "connector.ready", connections: ready });
			} catch (error) {
				if (!active) return;
				realtime.send({ type: "connector.ready", connections: [] });
				if (requestId) void failRequest(requestId, grantError(error), dispatchSeq);
			}
		};
		/**
		 * Store each grant the server dispatched here, then report readiness once. One failed grant
		 * fails the whole request with its real code: a partly stored set must not look ready to the Bot.
		 */
		const grant = async (requestId: string, grants: ConnectorGrant[], dispatchSeq?: number) => {
			if (!active) return;
			try {
				await invokeLocalFiles("local_files_activate", { context });
				for (const item of grants) {
					if (!active) return;
					await invokeLocalFiles("local_files_authorize", {
						context,
						config: {
							id: item.connectionId,
							connectorId: item.connectorId,
							scope: item.scope,
							capabilities: item.capabilities,
							revision: item.revision,
						},
					});
					written.set(item.connectionId, item.revision);
				}
			} catch (error) {
				if (active) await failRequest(requestId, grantError(error), dispatchSeq);
				return;
			}
			await refreshReady(requestId, dispatchSeq);
		};
		const execute = async (command: ConnectorCommand) => {
			if (!active || pending.has(command.id)) return;
			const state: PendingCommand = { cancelled: false };
			pending.set(command.id, state);
			try {
				let result: ConnectorCommandResult;
				const expiresAtMs = Date.parse(command.expiresAt);
				if (!eligible(command.connectionId) || command.deviceId !== context.deviceId)
					result = { ok: false, error: "permission_denied" };
				else if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) result = { ok: false, error: "cancelled" };
				else {
					const { origin, ...nativeCommand } = command;
					const activity = activityLabel.current(`tray.connector.${command.operation}`);
					const identify = (items: Conversation[] | undefined) => {
						const conversation = items?.find((item) => item.id === origin?.conversationId);
						const bot = conversation?.members.find(
							(member) => member.kind === "bot" && member.memberId === origin?.botId,
						);
						const title = conversation?.title || (conversation?.kind === "direct" ? bot?.displayName : null);
						return conversation && bot && title
							? {
									botId: bot.memberId,
									botName: bot.displayName,
									conversationId: conversation.id,
									conversationTitle: title,
									activity,
								}
							: null;
					};
					const cached = origin
						? identify(query.getQueryData<{ items: Conversation[] }>(keys.conversations.list())?.items)
						: null;
					state.tray = beginTrayConnectorWork(cached);
					if (origin && !cached) {
						trayConversations ??= api.conversations().finally(() => {
							trayConversations = undefined;
						});
						void trayConversations
							.then(({ items }) => {
								if (!active || state.cancelled || pending.get(command.id) !== state || realtime.status !== "open")
									return;
								const row = identify(items);
								if (row) state.tray?.attribute(row);
							})
							.catch(() => {});
					}
					try {
						result = await invokeLocalFiles<ConnectorCommandResult>("local_files_execute", {
							context,
							command: { ...nativeCommand, expiresAtMs },
						});
					} catch (error) {
						result = {
							ok: false,
							error: ERRORS.has(String(error)) ? (String(error) as "permission_denied") : "read_failed",
						};
					}
				}
				if (active && !state.cancelled && realtime.status === "open") {
					state.tray?.update(activityLabel.current("tray.connector.report"));
					await api.submitConnectorResult(command.id, result);
				}
			} catch {
				// The server owns the deadline and rejects receipts after cancellation or expiry.
			} finally {
				state.tray?.finish();
				pending.delete(command.id);
			}
		};
		const stopEvents = realtime.subscribeEvents((event) => {
			if (event.type === "connector.command") void execute(event.command);
			else if (event.type === "connector.grant.request") void grant(event.requestId, event.grants, event.dispatchSeq);
			else if (event.type === "connector.command.cancelled") {
				const state = pending.get(event.commandId);
				if (state) {
					state.cancelled = true;
					state.tray?.finish();
					void invokeLocalFiles("local_files_cancel", { commandId: event.commandId }).catch(() => {});
				}
			}
		});
		const stopStatus = realtime.subscribe(() => {
			if (realtime.status !== "open") {
				for (const state of pending.values()) state.tray?.finish();
			}
			void refreshReady();
		});
		const stopGrants = onLocalFilesChanged(() => void refreshReady());
		// A list that changed since the last one answered for: drop written grants it no longer names (a
		// cancel or a rollback), then report again so the server sees what this device now serves.
		syncListRef.current = (listed) => {
			// The server's list is authoritative once it arrives: a written grant it no longer names was
			// cancelled or rolled back, and one it names with another revision was replaced.
			const current = new Map(listed.map((connection) => [connection.id, connection.revision]));
			for (const [id, revision] of [...written]) {
				if (current.get(id) !== revision) written.delete(id);
			}
			void refreshReady();
		};
		void refreshReady();
		return () => {
			active = false;
			syncListRef.current = null;
			for (const [id, state] of pending) {
				state.cancelled = true;
				state.tray?.finish();
				void invokeLocalFiles("local_files_cancel", { commandId: id }).catch(() => {});
			}
			stopEvents();
			stopStatus();
			stopGrants();
			realtime.send({ type: "connector.ready", connections: [] });
		};
	}, [api, context, realtime, query]);
	return null;
}
