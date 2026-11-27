import { ApiError, type ConnectorFileContent } from "@yonder/api-client";
import { deviceFileChild, deviceFileName } from "@yonder/chat-model";
import type { ConnectorInstance } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import {
	chatCacheGeneration,
	readChatCache,
	removeChatCache,
	updateChatCache,
	useData,
	usePerson,
} from "@yonder/ui-data";
import { type SidePage, SidePageActions, useOptionalSidePanel } from "@yonder/ui-shell";
import { ICON_SIZE } from "@yonder/ui-tokens";
import { File, Folder, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { deviceFileCacheKey } from "../lib/device-file-cache.ts";
import { isForeground, subscribeForeground } from "../lib/foreground.ts";
import { executeLocalFilePreview, prepareLocalFilePreview } from "../lib/local-file-preview.ts";
import { localFilesSupported, onLocalFilesChanged, useLocalFilesContext } from "../lib/local-files.ts";
import { AttachmentReader } from "../preview/attachment-preview.tsx";

type DeviceFile = Extract<ConnectorFileContent, { kind: "file" }>;
type Directory = Extract<ConnectorFileContent, { kind: "directory" }>;
type ReaderContent =
	| DeviceFile
	| Directory
	| { kind: "stale"; label: string; cached?: DeviceFile }
	| { kind: "error"; label: string };

export function deviceFilePage(source: ConnectorInstance, path: string): SidePage {
	return {
		key: `device-file:${source.deviceId}:${source.id}:${path}`,
		title: `${deviceFileName(path)} · ${source.deviceName}`,
		icon: <File size={ICON_SIZE.sm} aria-hidden="true" />,
		content: <DeviceFileReader source={source} path={path} />,
	};
}

async function verify(file: DeviceFile): Promise<boolean> {
	const digest = await crypto.subtle.digest("SHA-256", await file.blob.arrayBuffer());
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("") === file.sha256;
}

function DeviceFileReader({ source, path }: { source: ConnectorInstance; path: string }) {
	const { t } = useTranslation();
	const side = useOptionalSidePanel();
	const owner = usePerson()?.id;
	const { api, realtime } = useData();
	const context = useLocalFilesContext();
	const local = localFilesSupported() && (context ? context.deviceId === source.deviceId : source.currentDevice);
	const [content, setContent] = useState<ReaderContent>();
	const [checking, setChecking] = useState(true);
	const current = useRef<{ key: string; file: DeviceFile } | undefined>(undefined);
	const refresh = useRef<(() => void) | undefined>(undefined);
	useEffect(() => {
		if (!owner || (local && !context)) return;
		const key = deviceFileCacheKey(owner, source, path);
		let pending: AbortController | undefined;
		async function confirmGrant(signal: AbortSignal) {
			const { items } = await api.connectors();
			signal.throwIfAborted();
			if (!items.some((item) => item.id === source.id && item.revision === source.revision))
				throw new Error("permission_denied");
			if (local && context) await prepareLocalFilePreview(context, source, items, signal);
		}
		async function request(knownSha256: string | undefined, signal: AbortSignal) {
			const args = knownSha256 ? { knownSha256 } : {};
			if (!local || !context) return api.connectorFilePreview(source.id, { path, ...args }, signal);
			const expiresAtMs = Date.now() + 30_000;
			return executeLocalFilePreview(
				context,
				{
					id: crypto.randomUUID(),
					connectionId: source.id,
					deviceId: source.deviceId,
					connectorId: "local-files",
					scope: source.scope,
					capabilities: source.capabilities,
					revision: source.revision,
					operation: "file_preview",
					path,
					args,
					expiresAtMs,
					expiresAt: new Date(expiresAtMs).toISOString(),
				},
				signal,
			);
		}
		function forget() {
			current.current = undefined;
			void removeChatCache(key).catch(() => {});
		}
		async function read(recheck = false) {
			pending?.abort();
			const controller = new AbortController();
			pending = controller;
			const { signal } = controller;
			const generation = chatCacheGeneration();
			const active = () => !signal.aborted && generation === chatCacheGeneration();
			setChecking(true);
			if (recheck) setContent(undefined);
			const known = current.current?.key === key ? current.current.file : undefined;
			let cached = known;
			try {
				const saved = known ? undefined : await readChatCache<DeviceFile>(key).catch(() => undefined);
				const verified = saved && (await verify(saved).catch(() => false));
				if (!active()) return;
				if (verified) cached = saved;
				else if (saved) forget();
				if (local || (cached && (recheck || !known))) await confirmGrant(signal);
				if (!active()) return;
				if (cached && (recheck || !known)) setContent(cached);
				let result = await request(cached?.sha256, signal);
				if (result.kind === "unchanged") {
					if (cached?.sha256 === result.sha256) result = cached;
					else result = await request(undefined, signal);
				}
				if (!active()) return;
				if (result.kind === "directory") {
					if (cached) forget();
					setContent(result);
					return;
				}
				if (result.kind !== "file" || (result !== cached && !(await verify(result)))) throw new Error("hash_mismatch");
				if (!active()) return;
				current.current = { key, file: result };
				setContent(result);
				if (result !== cached)
					void updateChatCache<DeviceFile>(key, (previous) => (active() ? result : previous), generation).catch(
						() => {},
					);
			} catch (error) {
				if (!active()) return;
				const reason =
					error instanceof ApiError ? error.details?.reason : error instanceof Error ? error.message : error;
				if (reason === "device_unavailable" || (error instanceof ApiError && error.code === "device_offline")) {
					// Connector readiness and the source device's online presence are separate.
					const presence =
						reason === "device_unavailable"
							? await api
									.devices()
									.then(({ items }) => items.find(({ id }) => id === source.deviceId)?.status)
									.catch(() => undefined)
							: "offline";
					if (!active()) return;
					if (!presence) setContent({ kind: "error", label: "deviceFiles.readFailed" });
					else {
						const label =
							presence === "online"
								? cached
									? "deviceFiles.sourceNotReadyCopy"
									: "deviceFiles.sourceNotReady"
								: cached
									? "deviceFiles.offlineCopy"
									: "deviceFiles.offline";
						setContent({ kind: "stale", label, ...(cached ? { cached } : {}) });
					}
					return;
				}
				if (reason === "device_update_required") setContent({ kind: "error", label: "deviceFiles.updateSource" });
				else if (reason === "hash_mismatch") {
					forget();
					setContent({ kind: "error", label: "deviceFiles.verifyFailed" });
				} else if (
					reason === "permission_denied" ||
					reason === "not_found" ||
					(error instanceof ApiError && [401, 403, 404].includes(error.status))
				) {
					forget();
					setContent({ kind: "error", label: "deviceFiles.unavailable" });
				} else setContent({ kind: "error", label: "deviceFiles.readFailed" });
			} finally {
				if (active()) setChecking(false);
			}
		}
		refresh.current = () => void read();
		void read(true);
		const stopFocus = subscribeForeground(() => {
			if (isForeground()) void read();
		});
		const stopEvents = realtime.subscribeEvents((event) => {
			if (event.type === "connectors.changed" || event.type === "devices.changed") void read(true);
		});
		const stopLocal = onLocalFilesChanged((id) => {
			if (id !== source.id) return;
			pending?.abort();
			forget();
			setContent({ kind: "error", label: "deviceFiles.unavailable" });
			setChecking(false);
		});
		return () => {
			pending?.abort();
			refresh.current = undefined;
			stopFocus();
			stopEvents();
			stopLocal();
		};
	}, [api, context, local, owner, path, realtime, source]);

	const file = content?.kind === "file" ? content : content?.kind === "stale" ? content.cached : undefined;
	const status = content?.kind === "error" || content?.kind === "stale" ? content.label : undefined;
	return (
		<section data-device-file-reader className="flex h-full min-h-0 flex-col">
			<SidePageActions className="flex flex-wrap items-center gap-[var(--spacing-2)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]">
				<span className="me-auto flex flex-wrap items-center gap-[var(--spacing-2)]">
					<span>{source.deviceName}</span>
					{checking ? (
						<LoaderCircle
							role="status"
							aria-label={t("deviceFiles.checking")}
							className="animate-spin motion-reduce:animate-none"
							size={16}
						/>
					) : null}
					{status ? <span role="status">{t(status)}</span> : null}
					{status && !checking ? (
						<Button size="sm" variant="link" onClick={() => refresh.current?.()}>
							{t("app.retry")}
						</Button>
					) : null}
				</span>
			</SidePageActions>
			{content?.kind === "directory" ? (
				<div className="min-h-0 flex-1 overflow-y-auto p-[var(--spacing-3)]">
					{content.entries.length ? (
						<ul>
							{[...content.entries]
								.sort(
									(a, b) =>
										Number(b.type === "directory") - Number(a.type === "directory") || a.name.localeCompare(b.name),
								)
								.map((entry) => {
									const child = deviceFileChild(path, entry.name);
									if (!child) return null;
									const Icon = entry.type === "directory" ? Folder : File;
									return (
										<li key={entry.name}>
											<button
												type="button"
												className="flex w-full items-center gap-[var(--spacing-2)] rounded-[var(--radius-control-sm)] p-[var(--spacing-2)] text-start hover:bg-[var(--color-bg-hover)]"
												onClick={() => {
													const page = deviceFilePage(source, child);
													if (entry.type === "directory") side?.push(page);
													else side?.open(page);
												}}
											>
												<Icon size={16} aria-hidden="true" className="shrink-0" />
												<span className="min-w-0 break-words">{entry.name}</span>
											</button>
										</li>
									);
								})}
						</ul>
					) : (
						<p role="status">{t("deviceFiles.emptyDirectory")}</p>
					)}
					{content.truncated ? (
						<p role="status" className="text-caption text-[var(--color-text-secondary)]">
							{t("deviceFiles.partialDirectory")}
						</p>
					) : null}
				</div>
			) : file ? (
				<div className="min-h-0 flex-1">
					<AttachmentReader file={{ name: file.name, mimeType: file.blob.type, blob: file.blob }} />
				</div>
			) : null}
		</section>
	);
}
