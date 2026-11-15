import type { ConnectorCommand, ConnectorCommandResult } from "@yonder/protocol";
import { useConnectors, useData } from "@yonder/ui-data";
import { useEffect } from "react";
import { invokeLocalFiles, onLocalFilesChanged, useLocalFilesContext } from "./local-files.ts";

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

/** The main desktop webview provides local tools over its existing account socket. */
export function LocalFilesRuntime() {
	const context = useLocalFilesContext();
	const { api, realtime } = useData();
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
		const pending = new Map<string, { cancelled: boolean }>();
		const refreshReady = async () => {
			if (!active || realtime.status !== "open") return;
			try {
				await invokeLocalFiles("local_files_activate", { context });
				if (!active) return;
				const ready = await invokeLocalFiles<{ id: string; revision: number }[]>("local_files_ready", {
					context,
					connections,
				});
				if (active) realtime.send({ type: "connector.ready", connections: ready });
			} catch {
				if (active) realtime.send({ type: "connector.ready", connections: [] });
			}
		};
		const execute = async (command: ConnectorCommand) => {
			if (!active || pending.has(command.id)) return;
			const state = { cancelled: false };
			pending.set(command.id, state);
			try {
				let result: ConnectorCommandResult;
				const expiresAtMs = Date.parse(command.expiresAt);
				if (!eligible.has(command.connectionId) || command.deviceId !== context.deviceId)
					result = { ok: false, error: "permission_denied" };
				else if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) result = { ok: false, error: "cancelled" };
				else {
					try {
						result = await invokeLocalFiles<ConnectorCommandResult>("local_files_execute", {
							context,
							command: { ...command, expiresAtMs },
						});
					} catch (error) {
						result = {
							ok: false,
							error: ERRORS.has(String(error)) ? (String(error) as "permission_denied") : "read_failed",
						};
					}
				}
				if (active && !state.cancelled && realtime.status === "open")
					await api.submitConnectorResult(command.id, result);
			} catch {
				// The server owns the deadline and rejects receipts after cancellation or expiry.
			} finally {
				pending.delete(command.id);
			}
		};
		const stopEvents = realtime.subscribeEvents((event) => {
			if (event.type === "connector.command") void execute(event.command);
			else if (event.type === "connector.command.cancelled") {
				const state = pending.get(event.commandId);
				if (state) {
					state.cancelled = true;
					void invokeLocalFiles("local_files_cancel", { commandId: event.commandId }).catch(() => {});
				}
			}
		});
		const stopStatus = realtime.subscribe(() => void refreshReady());
		const stopGrants = onLocalFilesChanged(() => void refreshReady());
		void refreshReady();
		return () => {
			active = false;
			for (const [id, state] of pending) {
				state.cancelled = true;
				void invokeLocalFiles("local_files_cancel", { commandId: id }).catch(() => {});
			}
			stopEvents();
			stopStatus();
			stopGrants();
			realtime.send({ type: "connector.ready", connections: [] });
		};
	}, [api, context, realtime, connectionIds]);
	return null;
}
