import { ApiError, type ConnectorFileContent } from "@yonder/api-client";
import type { ConnectorFilePreviewRequest, ConnectorFileTextPage, ConnectorInstance } from "@yonder/protocol";
import {
	chatCacheGeneration,
	readChatCache,
	removeChatCache,
	updateChatCache,
	useData,
	usePerson,
} from "@yonder/ui-data";
import { useEffect, useRef, useState } from "react";
import { downloadAttachment } from "../preview/attachment-preview.tsx";
import { clearDeviceFileCache, deviceFileCacheKey, deviceFileVersionKey } from "./device-file-cache.ts";
import { isForeground, subscribeForeground } from "./foreground.ts";
import { executeLocalFilePreview, prepareLocalFilePreview, validHash } from "./local-file-preview.ts";
import { localFilesSupported, onLocalFilesChanged, useLocalFilesContext } from "./local-files.ts";

type Original = Extract<ConnectorFileContent, { kind: "file" }>;
type Directory = Extract<ConnectorFileContent, { kind: "directory" }>;
type Head = Original | ConnectorFileTextPage;

type View = { head: Original } | { head: ConnectorFileTextPage; pages: ConnectorFileTextPage[] };
type DeviceFilePreview = View | { directory: Directory };
type Progress = {
	checking?: boolean;
	paging?: boolean;
	downloading?: boolean;
	downloadError?: string | undefined;
	status?: string | undefined;
	error?: string | undefined;
};

function reasonFor(error: unknown) {
	if (error instanceof ApiError) return error.details?.reason ?? error.code;
	return error instanceof Error ? error.message : undefined;
}

function denied(error: unknown) {
	const reason = reasonFor(error);
	return (
		reason === "permission_denied" ||
		reason === "not_found" ||
		(error instanceof ApiError && [401, 403, 404].includes(error.status) && reason !== "device_update_required")
	);
}

async function hashMatches(bytes: ArrayBuffer, sha256: string) {
	if (!validHash(sha256)) return false;
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("") === sha256;
}

async function verifiedPage(page: ConnectorFileTextPage, offset: number, sha256 = page.sha256) {
	if (page.kind !== "text_page" || page.offset !== offset || !validHash(sha256) || page.sha256 !== sha256) return false;
	if (typeof page.content !== "string") return false;
	const bytes = new TextEncoder().encode(page.content);
	return (
		bytes.byteLength <= 64 * 1024 &&
		(page.nextOffset === null || (bytes.byteLength > 0 && page.nextOffset === offset + bytes.byteLength)) &&
		(await hashMatches(bytes.buffer, page.pageSha256)) &&
		(offset !== 0 || page.nextOffset !== null || page.pageSha256 === sha256)
	);
}

function verifiedHead(head: Head) {
	if (head.kind === "text_page") return verifiedPage(head, 0);
	if (head.kind === "file" && head.blob instanceof Blob)
		return head.blob.arrayBuffer().then((bytes) => hashMatches(bytes, head.sha256));
	return Promise.resolve(false);
}

const fileView = (head: Head): View => (head.kind === "text_page" ? { head, pages: [head] } : { head });

export function useDeviceFilePreview(source: ConnectorInstance, path: string) {
	const owner = usePerson()?.id;
	const { api, realtime } = useData();
	const context = useLocalFilesContext();
	const native = localFilesSupported();
	const local = native && context?.deviceId === source.deviceId;
	const resource = owner && deviceFileCacheKey(owner, source, path);
	const [result, setResult] = useState<{ key: string; document?: DeviceFilePreview; progress: Progress }>();
	const actions = useRef<{ refresh: () => void; more: () => void; download: () => void }>(undefined);
	useEffect(() => {
		if (!resource || (native && !context)) return;
		const key = resource;
		const generation = chatCacheGeneration();
		let pending: AbortController | undefined;
		let document: DeviceFilePreview | undefined;
		let progress: Progress = {};
		let offline = false;
		let revoked = false;
		const active = (signal: AbortSignal) => !signal.aborted && generation === chatCacheGeneration();
		const render = (updates: Progress = {}) => {
			progress = { ...progress, ...updates };
			setResult(document ? { key, document, progress } : { key, progress });
		};
		const forget = () => {
			document = undefined;
			void clearDeviceFileCache(key).catch(() => {});
		};
		async function confirmGrant(signal: AbortSignal) {
			const { items } = await api.connectors();
			signal.throwIfAborted();
			if (!items.some((item) => item.id === source.id && item.revision === source.revision))
				throw new Error("permission_denied");
			if (local && context) await prepareLocalFilePreview(context, source, items, signal);
		}
		async function request(body: Omit<ConnectorFilePreviewRequest, "path">, signal: AbortSignal) {
			if (!local || !context) return api.connectorFilePreview(source.id, { path, ...body }, signal);
			const args = {
				...(body.knownSha256 ? { knownSha256: body.knownSha256 } : {}),
				...(body.delivery === "auto"
					? {
							textPage: {
								offset: body.offset ?? 0,
								...(body.expectedSha256 ? { expectedSha256: body.expectedSha256 } : {}),
							},
						}
					: {}),
			};
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
		async function first(knownSha256: string | undefined, signal: AbortSignal) {
			const known = knownSha256 ? { knownSha256 } : {};
			try {
				return await request({ ...known, delivery: "auto" }, signal);
			} catch (error) {
				if (
					!(
						error instanceof ApiError &&
						error.status === 400 &&
						error.code === "invalid_request" &&
						error.message === "invalid file preview" &&
						error.details?.reason === undefined
					)
				)
					throw error;
				return request(known, signal);
			}
		}
		async function save<T>(cacheKey: string, value: T, signal: AbortSignal) {
			return updateChatCache<T>(cacheKey, (previous) => (active(signal) ? value : previous), generation)
				.then((saved) => saved === value)
				.catch(() => false);
		}
		async function original(
			result: Original | Extract<ConnectorFileContent, { kind: "download" }>,
			cacheKey: string,
			signal: AbortSignal,
			expectedSha256?: string,
		): Promise<Original> {
			if (expectedSha256 && result.sha256 !== expectedSha256) throw new Error("conflict");
			let file: Original;
			if (result.kind === "download") {
				const response = await fetch(result.url, { credentials: "omit", signal });
				if (!response.ok) throw new Error("read_failed");
				const bytes = await response.arrayBuffer();
				if (bytes.byteLength !== result.size || !(await hashMatches(bytes, result.sha256)))
					throw new Error("hash_mismatch");
				file = {
					kind: "file",
					name: result.name,
					sha256: result.sha256,
					blob: new Blob([bytes], { type: result.mimeType }),
				};
			} else {
				if (!(await verifiedHead(result))) throw new Error("hash_mismatch");
				file = result;
			}
			signal.throwIfAborted();
			const saved = await save(cacheKey, file, signal);
			if (saved && active(signal) && result.kind === "download")
				void api.acknowledgeConnectorFilePreview(source.id, result.receipt, file.sha256, signal).catch(() => {});
			return file;
		}
		async function read(hide = false, reset = false) {
			if (revoked) return;
			pending?.abort();
			const controller = new AbortController();
			pending = controller;
			const { signal } = controller;
			offline = false;
			const existing = document && "head" in document ? document : undefined;
			if (hide || reset) document = undefined;
			render({
				checking: true,
				paging: false,
				downloading: false,
				error: undefined,
				status: undefined,
				downloadError: undefined,
			});
			try {
				let cached = reset ? undefined : existing;
				if (!cached && !reset) {
					const head = await readChatCache<Head>(key).catch(() => undefined);
					if (head && (await verifiedHead(head).catch(() => false))) cached = fileView(head);
				}
				if (!active(signal)) return;
				if (local || cached) await confirmGrant(signal);
				if (!active(signal)) return;
				if (cached) {
					document = cached;
					render();
				}
				let fetched = await first(cached?.head.sha256, signal);
				if (!active(signal)) return;
				if (fetched.kind === "unchanged" && cached?.head.sha256 !== fetched.sha256)
					fetched = await first(undefined, signal);
				if (!active(signal)) return;
				if (fetched.kind === "unchanged" && cached?.head.sha256 === fetched.sha256) return;
				if (fetched.kind === "directory") {
					forget();
					document = { directory: fetched };
					return;
				}
				let head: Head;
				if (fetched.kind === "text_page") {
					if (!(await verifiedPage(fetched, 0))) throw new Error("hash_mismatch");
					head = fetched;
					await save(key, head, signal);
				} else if (fetched.kind === "file" || fetched.kind === "download") head = await original(fetched, key, signal);
				else throw new Error("read_failed");
				if (!active(signal)) return;
				document = cached?.head.sha256 === head.sha256 && cached.head.kind === head.kind ? cached : fileView(head);
				void clearDeviceFileCache(key, head.sha256).catch(() => {});
			} catch (error) {
				if (!active(signal)) return;
				const reason = reasonFor(error);
				if (denied(error) || reason === "hash_mismatch") forget();
				if (reason === "device_unavailable" || reason === "device_offline") {
					const presence =
						reason === "device_offline"
							? "offline"
							: await api
									.devices()
									.then(({ items }) => items.find(({ id }) => id === source.deviceId)?.status)
									.catch(() => undefined);
					if (!active(signal)) return;
					offline = true;
					render({
						status:
							presence === "online"
								? document
									? "deviceFiles.sourceNotReadyCopy"
									: "deviceFiles.sourceNotReady"
								: presence
									? document
										? "deviceFiles.offlineCopy"
										: "deviceFiles.offline"
									: "deviceFiles.readFailed",
					});
				} else {
					render({
						status: denied(error)
							? "deviceFiles.unavailable"
							: reason === "device_update_required"
								? "deviceFiles.updateSource"
								: reason === "hash_mismatch"
									? "deviceFiles.verifyFailed"
									: "deviceFiles.readFailed",
					});
				}
			} finally {
				if (active(signal)) render({ checking: false });
			}
		}
		async function more() {
			const signal = pending?.signal;
			if (!signal || !active(signal) || progress.checking || progress.paging || !document || !("pages" in document))
				return;
			const view = document;
			const offset = view.pages.at(-1)?.nextOffset;
			if (offset == null) return;
			const expectedSha256 = view.head.sha256;
			const cacheKey = deviceFileVersionKey(key, expectedSha256, offset);
			render({ paging: true, error: undefined });
			try {
				let page = await readChatCache<ConnectorFileTextPage>(cacheKey).catch(() => undefined);
				if (page && !(await verifiedPage(page, offset, expectedSha256))) {
					if (active(signal)) await removeChatCache(cacheKey).catch(() => {});
					page = undefined;
				}
				if (!active(signal)) return;
				const fromCache = Boolean(page);
				if (!page) {
					if (offline) throw new Error("device_offline");
					const response = await request({ delivery: "auto", offset, expectedSha256 }, signal);
					if (response.kind !== "text_page" || !(await verifiedPage(response, offset, expectedSha256)))
						throw new Error("hash_mismatch");
					page = response;
				}
				const pages = [...view.pages, page];
				if (page.nextOffset === null) {
					const complete = new TextEncoder().encode(pages.map((part) => part.content).join(""));
					if (!(await hashMatches(complete.buffer, expectedSha256))) {
						if (fromCache && active(signal)) await removeChatCache(cacheKey).catch(() => {});
						throw new Error("hash_mismatch");
					}
				}
				if (!fromCache) await save(cacheKey, page, signal);
				if (active(signal)) document = { ...view, pages };
			} catch (error) {
				if (active(signal)) continueAfter(error);
			} finally {
				if (active(signal)) render({ paging: false });
			}
		}
		function continueAfter(error: unknown) {
			if (reasonFor(error) === "conflict") void read(false, true);
			else if (denied(error)) {
				pending?.abort();
				forget();
				render({ status: "deviceFiles.unavailable", checking: false, paging: false, downloading: false });
			} else
				render({ error: reasonFor(error) === "hash_mismatch" ? "deviceFiles.verifyFailed" : "deviceFiles.readFailed" });
		}
		async function download() {
			const signal = pending?.signal;
			if (
				!signal ||
				!active(signal) ||
				progress.checking ||
				progress.downloading ||
				!document ||
				!("pages" in document)
			)
				return;
			const expectedSha256 = document.head.sha256;
			const originalKey = deviceFileVersionKey(key, expectedSha256, "original");
			render({ downloading: true, downloadError: undefined });
			try {
				await confirmGrant(signal);
				let file = await readChatCache<Original>(originalKey).catch(() => undefined);
				if (file && (file.sha256 !== expectedSha256 || !(await verifiedHead(file)))) {
					if (active(signal)) await removeChatCache(originalKey).catch(() => {});
					file = undefined;
				}
				if (!active(signal)) return;
				if (!file) {
					const response = await request({ delivery: "original", expectedSha256 }, signal);
					if (response.kind !== "file" && response.kind !== "download") throw new Error("read_failed");
					file = await original(response, originalKey, signal, expectedSha256);
				}
				if (active(signal)) downloadAttachment({ ...file, mimeType: file.blob.type });
			} catch (error) {
				if (active(signal)) {
					if (reasonFor(error) === "conflict" || denied(error)) continueAfter(error);
					else
						render({
							downloadError:
								reasonFor(error) === "hash_mismatch" ? "deviceFiles.verifyFailed" : "deviceFiles.readFailed",
						});
				}
			} finally {
				if (active(signal)) render({ downloading: false });
			}
		}
		actions.current = { refresh: () => void read(), more: () => void more(), download: () => void download() };
		void read(true);
		const stopFocus = subscribeForeground(() => {
			if (isForeground()) void read();
		});
		const stopEvents = realtime.subscribeEvents((event) => {
			if (event.type === "connectors.changed" || event.type === "devices.changed") void read(true);
		});
		const stopLocal = onLocalFilesChanged((id) => {
			if (id !== source.id) return;
			revoked = true;
			pending?.abort();
			forget();
			render({ checking: false, paging: false, downloading: false, status: "deviceFiles.unavailable" });
		});
		return () => {
			pending?.abort();
			actions.current = undefined;
			stopFocus();
			stopEvents();
			stopLocal();
		};
	}, [api, context, local, native, path, realtime, resource, source]);
	return {
		document: result?.key === resource ? result?.document : undefined,
		progress: result?.key === resource && result ? result.progress : { checking: true },
		refresh: () => actions.current?.refresh(),
		more: () => actions.current?.more(),
		download: () => actions.current?.download(),
	};
}
