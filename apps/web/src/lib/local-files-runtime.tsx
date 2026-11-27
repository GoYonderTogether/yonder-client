import type {
	ConnectorCommand,
	ConnectorCommandResult,
	ConnectorGrant,
	ConnectorInstance,
	Conversation,
} from "@yonder/protocol";
import { keys, useConnectors, useData, useDataQueryClient } from "@yonder/ui-data";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
	cancelAppleResource,
	executeAppleResource,
	executeAppleResourceFile,
	readyAppleResourceGrants,
} from "./apple-resources.ts";
import { isForeground, subscribeForeground } from "./foreground.ts";
import { executeLocalFilePreview } from "./local-file-preview.ts";
import {
	activateAppleConnectors,
	invokeLocalFiles,
	isAppleConnector,
	onLocalFilesChanged,
	resetAppleConnectors,
	useLocalFilesContext,
} from "./local-files.ts";
import { beginTrayConnectorWork } from "./tray-bridge.ts";

type PendingCommand = {
	cancelled: boolean;
	apple: boolean;
	connectionId: string;
	revision: number;
	upload?: AbortController;
	tray?: ReturnType<typeof beginTrayConnectorWork>;
};

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
	// A photo whose pixels are only in iCloud, and an asset with no readable local copy: the real
	// states the server and the model need, never collapsed into a generic read failure.
	"icloud_only",
	"unavailable",
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
export function LocalFilesRuntime({ files = true, apple = false }: { files?: boolean; apple?: boolean } = {}) {
	const { t } = useTranslation();
	const context = useLocalFilesContext();
	const { api, realtime } = useData();
	const query = useDataQueryClient();
	const activityLabel = useRef(t);
	activityLabel.current = t;
	const connectors = useConnectors({ enabled: context !== null, apple });
	// `null` means the list has not loaded yet, which is not the same as having no connections.
	const connections = useMemo<ConnectorInstance[] | null>(
		() =>
			connectors.data ? connectors.data.items.filter((connection) => connection.deviceId === context?.deviceId) : null,
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
	const syncListRef = useRef<((listed: ConnectorInstance[]) => void) | null>(null);
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
		const revoked = new Set<string>();
		let appleReady = new Set<string>();
		let readyAttempt = 0;
		let trayConversations: Promise<{ items: Conversation[] }> | undefined;
		const knownConnections = () =>
			[
				...new Map([
					...(connectionsRef.current ?? [])
						.filter((item) => !apple || !isAppleConnector(item.connectorId))
						.map((item) => [item.id, item.revision] as const),
					...written,
				]),
			]
				.filter(([id]) => !revoked.has(id))
				.map(([id, revision]) => ({ id, revision }));
		const eligible = (connectionId: string) =>
			!revoked.has(connectionId) &&
			(written.has(connectionId) || (connectionsRef.current ?? []).some((item) => item.id === connectionId));
		const eligibleApple = (command: ConnectorCommand) =>
			apple &&
			!revoked.has(command.connectionId) &&
			(files || isForeground()) &&
			command.deviceId === context.deviceId &&
			command.scope === "device" &&
			command.capabilities.fileTools === false &&
			command.path === "" &&
			appleReady.has(`${command.connectionId}:${command.revision}`) &&
			(connectionsRef.current ?? []).some(
				(item) =>
					item.id === command.connectionId &&
					item.revision === command.revision &&
					item.connectorId === command.connectorId &&
					item.scope === command.scope &&
					item.capabilities.fileTools === false,
			);
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
			const attempt = ++readyAttempt;
			const readyFiles = async () => {
				if (!files) return [];
				await invokeLocalFiles("local_files_activate", { context });
				if (!active) return [];
				return invokeLocalFiles<{ id: string; revision: number; toolsVersion: number }[]>("local_files_ready", {
					context,
					connections: knownConnections(),
				});
			};
			const readyApple = async () => {
				if (!apple) return [];
				const listed = (connectionsRef.current ?? [])
					.filter(
						(item) =>
							!revoked.has(item.id) &&
							isAppleConnector(item.connectorId) &&
							item.scope === "device" &&
							!item.capabilities.fileTools,
					)
					.map(({ id, revision }) => ({ id, revision }));
				await activateAppleConnectors(context);
				return active ? readyAppleResourceGrants(context, files || isForeground() ? listed : []) : [];
			};
			const [fileResult, appleResult] = await Promise.allSettled([readyFiles(), readyApple()]);
			if (!active) return;
			if (requestId && fileResult.status === "rejected")
				void failRequest(requestId, grantError(fileResult.reason), dispatchSeq);
			if (attempt !== readyAttempt || realtime.status !== "open") return;
			const appleGrants = appleResult.status === "fulfilled" ? (appleResult.value ?? []) : [];
			appleReady = new Set(appleGrants.map(({ id, revision }) => `${id}:${revision}`));
			realtime.send({
				type: "connector.ready",
				connections: [...(fileResult.status === "fulfilled" ? (fileResult.value ?? []) : []), ...appleGrants],
			});
		};
		/**
		 * Store each grant the server dispatched here, then report readiness once. One failed grant
		 * fails the whole request with its real code: a partly stored set must not look ready to the Bot.
		 */
		const grant = async (requestId: string, grants: ConnectorGrant[], dispatchSeq?: number) => {
			if (!active) return;
			if (!files || grants.some((item) => apple && isAppleConnector(item.connectorId))) {
				void failRequest(requestId, "permission_denied", dispatchSeq);
				return;
			}
			try {
				await invokeLocalFiles("local_files_activate", { context });
				for (const item of grants) {
					if (!active) return;
					if (revoked.has(item.connectionId)) throw new Error("permission_denied");
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
			if (!active || realtime.status !== "open" || pending.has(command.id)) return;
			const appleCommand = command.connectorId?.startsWith("apple-") ?? false;
			const state: PendingCommand = {
				cancelled: false,
				apple: appleCommand,
				connectionId: command.connectionId,
				revision: command.revision,
			};
			pending.set(command.id, state);
			try {
				let result: ConnectorCommandResult;
				const expiresAtMs = Date.parse(command.expiresAt);
				if (
					appleCommand
						? !eligibleApple(command)
						: !files || !eligible(command.connectionId) || command.deviceId !== context.deviceId
				)
					result = { ok: false, error: "permission_denied" };
				else if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) result = { ok: false, error: "cancelled" };
				else {
					const { origin, ...nativeCommand } = command;
					const readsOriginal = command.operation === "asset_original" || command.operation === "file_preview";
					const activity = activityLabel.current(
						`tray.connector.${appleCommand ? (command.operation.endsWith("_list") ? "list" : "read") : readsOriginal ? "read" : command.operation}`,
					);
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
					if (files) state.tray = beginTrayConnectorWork(cached);
					if (files && origin && !cached) {
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
						const native = { ...nativeCommand, expiresAtMs };
						const { operation, args } = command;
						if (!appleCommand && (operation === "asset_original" || operation === "file_preview")) {
							const file = await executeLocalFilePreview(context, native);
							if (
								!active ||
								state.cancelled ||
								realtime.status !== "open" ||
								!eligible(command.connectionId) ||
								expiresAtMs <= Date.now()
							)
								throw new Error("cancelled");
							if (file.kind === "file") {
								state.upload = new AbortController();
								const attachment = await api.uploadConnectorAttachment(command.id, file.blob, state.upload.signal);
								result = {
									ok: true,
									result:
										operation === "asset_original"
											? { kind: operation, attachment }
											: { kind: "file", sha256: file.sha256, attachment },
								};
							} else if (operation === "file_preview") result = { ok: true, result: file };
							else throw new Error("unsupported_file");
						} else if (!appleCommand) {
							result = await invokeLocalFiles<ConnectorCommandResult>("local_files_execute", {
								context,
								command: native,
							});
						} else if (
							operation === "apple_notes_attachment_read" ||
							operation === "apple_voice_memos_read" ||
							operation === "apple_voice_memos_transcribe"
						) {
							const { id, attachmentId } = args ?? {};
							if (!id || (operation === "apple_notes_attachment_read" && !attachmentId))
								throw new Error("path_invalid");
							const file = await executeAppleResourceFile(context, native);
							if (
								!active ||
								state.cancelled ||
								realtime.status !== "open" ||
								!eligibleApple(command) ||
								expiresAtMs <= Date.now()
							)
								throw new Error("cancelled");
							state.upload = new AbortController();
							if (operation === "apple_voice_memos_transcribe") {
								const { text } = await api.transcribeConnectorAudio(command.id, file, state.upload.signal);
								result = { ok: true, result: { kind: operation, id, text } };
							} else {
								const attachment = await api.uploadConnectorAttachment(command.id, file, state.upload.signal);
								result = {
									ok: true,
									result:
										operation === "apple_notes_attachment_read" && attachmentId
											? { kind: operation, id, attachmentId, attachment }
											: { kind: "apple_voice_memos_read", id, attachment },
								};
							}
						} else if (operation === "apple_photos_image") {
							// `view` asked for a photo's picture: encode at the read edge on the device,
							// stage it under this command, and hand the receipt back; the server marks it
							// ready and resolves the model's copy itself.
							const { id } = args ?? {};
							if (!id) throw new Error("path_invalid");
							const file = await executeAppleResourceFile(context, native);
							if (
								!active ||
								state.cancelled ||
								realtime.status !== "open" ||
								!eligibleApple(command) ||
								expiresAtMs <= Date.now()
							)
								throw new Error("cancelled");
							state.upload = new AbortController();
							const attachment = await api.uploadConnectorAttachment(command.id, file, state.upload.signal);
							result = { ok: true, result: { kind: "apple_photos_image", id, attachment } };
						} else {
							result = { ok: true, result: await executeAppleResource(context, native) };
						}
					} catch (error) {
						const code = error instanceof Error ? error.message : String(error);
						result = {
							ok: false,
							error: ERRORS.has(code) ? (code as "permission_denied") : "read_failed",
						};
					}
				}
				if (appleCommand && result.ok && (!eligibleApple(command) || expiresAtMs <= Date.now()))
					result = { ok: false, error: "cancelled" };
				if (appleCommand && !result.ok && result.error === "permission_denied") void refreshReady();
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
		const cancel = (id: string, state: PendingCommand) => {
			if (state.cancelled) return;
			state.cancelled = true;
			state.upload?.abort();
			state.tray?.finish();
			if (state.apple) void cancelAppleResource(id).catch(() => {});
			else if (files) void invokeLocalFiles("local_files_cancel", { commandId: id }).catch(() => {});
		};
		const stopEvents = realtime.subscribeEvents((event) => {
			if (event.type === "connector.command") void execute(event.command);
			else if (event.type === "connector.grant.request") void grant(event.requestId, event.grants, event.dispatchSeq);
			else if (event.type === "connector.command.cancelled") {
				const state = pending.get(event.commandId);
				if (state) cancel(event.commandId, state);
			}
		});
		const stopStatus = realtime.subscribe(() => {
			if (realtime.status !== "open") for (const [id, state] of pending) cancel(id, state);
			void refreshReady();
		});
		const stopGrants = onLocalFilesChanged((connectionId) => {
			if (connectionId) {
				revoked.add(connectionId);
				written.delete(connectionId);
				for (const [id, state] of pending) {
					if (state.connectionId === connectionId) cancel(id, state);
				}
			}
			void refreshReady();
		});
		const stopForeground = apple ? subscribeForeground(() => void refreshReady()) : undefined;
		// A list that changed since the last one answered for: drop written grants it no longer names (a
		// cancel or a rollback), then report again so the server sees what this device now serves.
		syncListRef.current = (listed) => {
			// The server's list is authoritative once it arrives: a written grant it no longer names was
			// cancelled or rolled back, and one it names with another revision was replaced.
			const current = new Map(listed.map((connection) => [connection.id, connection.revision]));
			for (const [id, revision] of [...written]) {
				if (current.get(id) !== revision) written.delete(id);
			}
			for (const [id, state] of pending) {
				if ((written.get(state.connectionId) ?? current.get(state.connectionId)) !== state.revision) cancel(id, state);
			}
			void refreshReady();
		};
		void refreshReady();
		return () => {
			active = false;
			syncListRef.current = null;
			for (const [id, state] of pending) cancel(id, state);
			stopEvents();
			stopStatus();
			stopGrants();
			stopForeground?.();
			if (apple) void resetAppleConnectors(context).catch(() => {});
			realtime.send({ type: "connector.ready", connections: [] });
		};
	}, [api, context, realtime, query, files, apple]);
	return null;
}
