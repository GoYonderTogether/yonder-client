import type { ConnectorCommand, ConnectorCommandResult, ConnectorGrant, Conversation } from "@yonder/protocol";
import { keys, useConnectors, useData, useDataQueryClient } from "@yonder/ui-data";
import { useEffect, useRef } from "react";
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
 */
export function LocalFilesRuntime() {
	const { t } = useTranslation();
	const context = useLocalFilesContext();
	const { api, realtime } = useData();
	const query = useDataQueryClient();
	const activityLabel = useRef(t);
	activityLabel.current = t;
	const connectors = useConnectors({ enabled: context !== null });
	const connectionIds = connectors.data?.items
		.filter((connection) => connection.deviceId === context?.deviceId)
		.map((connection) => `${connection.id}:${connection.revision}`)
		.sort()
		.join("\n");
	useEffect(() => {
		if (!context || connectionIds === undefined) return;
		let active = true;
		const connections = connectionIds
			? connectionIds.split("\n").map((key) => {
					const [id, revision] = key.split(":");
					return { id: id as string, revision: Number(revision) };
				})
			: [];
		const eligible = new Set(connections.map((c) => c.id));
		// The connections list is what the server last told us; a grant stored just now is added here
		// so readiness is reported without waiting for the list to refetch.
		const known = new Map(connections.map((connection) => [connection.id, connection.revision]));
		const pending = new Map<string, PendingCommand>();
		let trayConversations: Promise<{ items: Conversation[] }> | undefined;
		const refreshReady = async () => {
			if (!active || realtime.status !== "open") return;
			try {
				await invokeLocalFiles("local_files_activate", { context });
				if (!active) return;
				const ready = await invokeLocalFiles<{ id: string; revision: number }[]>("local_files_ready", {
					context,
					connections: [...known].map(([id, revision]) => ({ id, revision })),
				});
				if (active) realtime.send({ type: "connector.ready", connections: ready });
			} catch {
				if (active) realtime.send({ type: "connector.ready", connections: [] });
			}
		};
		/**
		 * Store each grant the server dispatched here, then report readiness once, as before. One
		 * failed grant fails the whole request with its real code: a partly stored set must not look
		 * ready to the Bot.
		 */
		const grant = async (requestId: string, grants: ConnectorGrant[]) => {
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
					known.set(item.connectionId, item.revision);
				}
				await refreshReady();
			} catch (error) {
				if (!active) return;
				await api.failConnectorRequest(requestId, grantError(error)).catch(() => {});
			}
		};
		const execute = async (command: ConnectorCommand) => {
			if (!active || pending.has(command.id)) return;
			const state: PendingCommand = { cancelled: false };
			pending.set(command.id, state);
			try {
				let result: ConnectorCommandResult;
				const expiresAtMs = Date.parse(command.expiresAt);
				if (!eligible.has(command.connectionId) || command.deviceId !== context.deviceId)
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
			else if (event.type === "connector.grant.request") void grant(event.requestId, event.grants);
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
		void refreshReady();
		return () => {
			active = false;
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
	}, [api, context, realtime, connectionIds, query]);
	return null;
}
