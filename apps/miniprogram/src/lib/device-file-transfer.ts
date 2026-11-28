import Taro from "@tarojs/taro";
import { type ApiClient, ApiError, NetworkError } from "@yonder/api-client";
import type {
	ConnectorFileDownload,
	ConnectorFilePreviewRequest,
	ConnectorFilePreviewStatus,
	ConnectorFileTextPage,
	ConnectorInstance,
} from "@yonder/protocol";
import { type DeviceFile, deviceTextDigest, verifyDeviceFile } from "./device-file-bytes";
import { downloadMedia, mediaCache, removeMediaFile } from "./image-cache";
import { metadataKey, readSnapshot, updateSnapshots, writeSnapshot } from "./metadata-cache";
import type { MiniResponse } from "./transport";

type Directory = Extract<ConnectorFilePreviewStatus, { kind: "directory" }>;
export type DeviceFileReading = Directory | ((DeviceFile | ConnectorFileTextPage) & { stale?: boolean });
export type DeviceFilePosition = Pick<ConnectorFilePreviewRequest, "delivery" | "offset" | "expectedSha256">;
type Original = Omit<DeviceFile, "bytes" | "localPath">;
type Latest = Original | { kind: "text_page"; sha256: string };

const isSha256 = (hash: unknown): hash is string => typeof hash === "string" && /^[a-f0-9]{64}$/u.test(hash);
let media: { scope: string; cache: ReturnType<typeof mediaCache> } | undefined;
let lastRaw: { key: string; file: DeviceFile } | undefined;

function deviceMedia(scope: string) {
	if (media?.scope !== scope) media = { scope, cache: mediaCache(scope) };
	return media.cache;
}

export function clearDeviceFileTransfers(owner: string | null, baseUrl: string) {
	lastRaw = undefined;
	if (!owner) return;
	try {
		deviceMedia(`${baseUrl}:${owner}:device-files`).remove(() => true);
	} catch {
		// The requesting account and authorization are still invalidated in memory.
	}
	media = undefined;
	updateSnapshots(metadataKey(owner, "device-file").slice(0, -1), () => undefined);
}

function verifiedPage(value: unknown, offset: number): ConnectorFileTextPage | undefined {
	if (!value || typeof value !== "object") return;
	const page = value as ConnectorFileTextPage;
	if (
		page.kind !== "text_page" ||
		typeof page.name !== "string" ||
		!page.name ||
		page.mimeType !== "text/plain" ||
		page.offset !== offset ||
		!isSha256(page.sha256) ||
		!isSha256(page.pageSha256) ||
		typeof page.content !== "string" ||
		page.content.includes("\0")
	)
		return;
	try {
		const length = encodeURIComponent(page.content).replace(/%[a-f0-9]{2}/giu, "_").length;
		if (
			length <= 65_536 &&
			(page.nextOffset === null ||
				(length > 0 && Number.isSafeInteger(page.nextOffset) && page.nextOffset === offset + length)) &&
			deviceTextDigest(page.content) === page.pageSha256
		)
			return page;
	} catch {
		// Invalid UTF-16 in a local snapshot must be refetched as UTF-8.
	}
}

async function fileBytes(path: string): Promise<ArrayBuffer> {
	const bytes =
		process.env.TARO_ENV === "h5"
			? await (await fetch(path, { credentials: "omit" })).arrayBuffer()
			: Taro.getFileSystemManager().readFileSync(path);
	if (!(bytes instanceof ArrayBuffer)) throw new Error("invalid file bytes");
	return bytes;
}

async function verifiedOriginal(file: Original, path: string): Promise<DeviceFile> {
	const bytes = await fileBytes(path);
	if (!verifyDeviceFile(bytes, file.sha256)) throw new Error("file checksum failed");
	return { ...file, bytes, localPath: path };
}

export async function readDeviceFile({
	client,
	owner,
	baseUrl,
	source,
	path,
	position,
	signal,
	current,
}: {
	client: ApiClient;
	owner: string;
	baseUrl: string;
	source: ConnectorInstance;
	path: string;
	position?: DeviceFilePosition;
	signal?: AbortSignal;
	current: () => void;
}): Promise<DeviceFileReading> {
	const resource = deviceTextDigest(JSON.stringify([source.id, source.deviceId, source.revision, path]));
	const prefix = metadataKey(owner, "device-file", resource);
	const latest = `${prefix}latest`;
	const cache = deviceMedia(`${baseUrl}:${owner}:device-files`);
	const originalKey = (sha256: string) => `${resource}:${sha256}`;
	const pageKey = (sha256: string, offset: number) => `${prefix}${sha256}:${offset}`;
	const endpoint = `/v1/connectors/${encodeURIComponent(source.id)}/file-preview`;
	const request = (body: ConnectorFilePreviewRequest) =>
		client.request<MiniResponse>(endpoint, { body, responseType: "response", signal });
	const { delivery = "auto", offset = 0, expectedSha256 } = position ?? {};
	const first = offset === 0 && !expectedSha256;
	const previous = readSnapshot<Latest>(latest)?.data;
	const cachedPage = (sha256: string, offset: number) =>
		verifiedPage(readSnapshot(pageKey(sha256, offset))?.data, offset);
	let cached: DeviceFile | ConnectorFileTextPage | undefined;
	current();
	if (delivery === "auto") {
		const sha = expectedSha256 ?? (previous?.kind === "text_page" ? previous.sha256 : undefined);
		const page = sha && cachedPage(sha, offset);
		if (page && page.sha256 === sha) cached = page;
		if (expectedSha256 && cached) return cached;
	}
	if (first && !cached && previous?.kind === "file") {
		const key = originalKey(previous.sha256);
		const saved = cache.persistentPath(key);
		if (saved) {
			cached = await verifiedOriginal(previous, saved).catch(() => undefined);
			if (!cached) cache.remove((candidate) => candidate === key);
		}
	}
	if (first && !cached && lastRaw?.key === `${owner}:${resource}`) cached = lastRaw.file;
	current();
	const body = { path, ...(first && cached ? { knownSha256: cached.sha256 } : {}) };
	try {
		const response = await request({ ...body, delivery, ...(offset ? { offset } : {}), expectedSha256 }).catch(
			(error) => {
				if (
					!first ||
					delivery !== "auto" ||
					!(error instanceof ApiError) ||
					error.status !== 400 ||
					error.code !== "invalid_request" ||
					error.message !== "invalid file preview" ||
					error.details?.reason !== undefined
				)
					throw error;
				current();
				return request(body);
			},
		);
		current();
		const hash = response.headers?.get("x-yonder-file-sha256");
		if (hash) {
			if (!first && delivery === "auto") throw new Error("conflict");
			const encoded = /filename\*=UTF-8''([^;]+)/i.exec(response.headers?.get("content-disposition") ?? "")?.[1];
			if (!encoded || !response.bytes || !verifyDeviceFile(response.bytes, hash))
				throw new Error("file checksum failed");
			if (expectedSha256 && hash !== expectedSha256) throw new Error("conflict");
			const file = {
				kind: "file" as const,
				name: decodeURIComponent(encoded),
				mime: response.headers?.get("content-type")?.split(";")[0] ?? "application/octet-stream",
				sha256: hash,
				bytes: response.bytes,
			};
			lastRaw = file.bytes.byteLength <= 8 * 1024 * 1024 ? { key: `${owner}:${resource}`, file } : undefined;
			return file;
		}
		const value = (await response.json()) as ConnectorFilePreviewStatus | ConnectorFileTextPage | ConnectorFileDownload;
		current();
		if (value?.kind === "unchanged" && first && cached?.sha256 === value.sha256) return cached;
		if (value?.kind === "directory" && first && Array.isArray(value.entries)) return value;
		if (value?.kind === "text_page" && delivery === "auto") {
			const page = verifiedPage(value, offset);
			if (!page) throw new Error("file checksum failed");
			if (expectedSha256 && page.sha256 !== expectedSha256) throw new Error("conflict");
			if (first && previous?.sha256 !== page.sha256) updateSnapshots(prefix, () => undefined);
			writeSnapshot(pageKey(page.sha256, offset), page);
			if (first) writeSnapshot<Latest>(latest, { kind: "text_page", sha256: page.sha256 });
			return page;
		}
		if (value?.kind === "download" && (first || delivery === "original")) return await downloadOriginal(value);
		throw new Error("invalid device file response");
	} catch (error) {
		current();
		if (first && cached && (error instanceof NetworkError || (error instanceof ApiError && error.status === 503)))
			return { ...cached, stale: true };
		if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
			updateSnapshots(prefix, () => undefined);
			cache.remove((key) => key.startsWith(`${resource}:`));
			if (lastRaw?.key === `${owner}:${resource}`) lastRaw = undefined;
		}
		throw error;
	}

	async function downloadOriginal(value: ConnectorFileDownload) {
		if (
			!isSha256(value.sha256) ||
			typeof value.name !== "string" ||
			!value.name ||
			typeof value.mimeType !== "string" ||
			!Number.isSafeInteger(value.size) ||
			value.size <= 0 ||
			typeof value.url !== "string" ||
			!value.url.startsWith("https://") ||
			typeof value.receipt !== "string" ||
			!value.receipt
		)
			throw new Error("invalid device file response");
		if (expectedSha256 && value.sha256 !== expectedSha256) throw new Error("conflict");
		const { name, mimeType: mime, sha256 } = value;
		const original: Original = { kind: "file", name, mime, sha256 };
		const key = originalKey(sha256);
		let fresh: DeviceFile | undefined;
		const localPath = await cache.get(
			key,
			async () => {
				const temporary = await downloadMedia(value.url);
				try {
					fresh = await verifiedOriginal(original, temporary);
					current();
					if (fresh.bytes.byteLength !== value.size) throw new Error("file size mismatch");
					return temporary;
				} catch (error) {
					removeMediaFile(temporary);
					throw error;
				}
			},
			/\.([a-z0-9]{1,5})$/iu.exec(name)?.[1],
		);
		const file = fresh
			? { ...fresh, localPath }
			: await verifiedOriginal(original, localPath).catch((error: unknown) => {
					cache.remove((candidate) => candidate === key);
					throw error;
				});
		current();
		if (file.bytes.byteLength !== value.size) {
			cache.remove((candidate) => candidate === key);
			throw new Error("file size mismatch");
		}
		if (cache.persistentPath(key) === localPath) {
			if (first) writeSnapshot<Latest>(latest, original);
			void client
				.request(`${endpoint}/${encodeURIComponent(value.receipt)}/ack`, { body: { sha256 }, signal })
				.catch(() => {});
		}
		return file;
	}
}
