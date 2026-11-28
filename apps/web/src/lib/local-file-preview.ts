import type {
	ConnectorCommand,
	ConnectorCommandResult,
	ConnectorFilePreviewStatus,
	ConnectorFileTextPage,
	ConnectorInstance,
} from "@yonder/protocol";
import { invokeLocalFiles, type LocalFilesContext } from "./local-files.ts";

const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;
const MAX_METADATA_BYTES = 512 * 1024;
const MAX_PAGE_BYTES = 64 * 1024;

export type NativeFilePreview =
	| ConnectorFilePreviewStatus
	| ConnectorFileTextPage
	| { kind: "file"; sha256: string; name: string; blob: File };

/** Same small metadata prefix used by the Apple resources bridge, followed by the exact original. */
export function decodeLocalFilePreview(buffer: ArrayBuffer): NativeFilePreview {
	if (buffer.byteLength < 5) throw new Error("read_failed");
	const headerLength = new DataView(buffer).getUint32(0);
	const offset = 4 + headerLength;
	if (!headerLength || headerLength > MAX_METADATA_BYTES || offset > buffer.byteLength) throw new Error("read_failed");
	const header = JSON.parse(
		new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(buffer, 4, headerLength)),
	) as Record<string, unknown>;
	if (header.kind === "file") {
		const { name, mimeType, sha256 } = header;
		if (typeof name !== "string" || !name || typeof mimeType !== "string" || !validHash(sha256))
			throw new Error("read_failed");
		if (buffer.byteLength - offset > MAX_ORIGINAL_BYTES) throw new Error("too_large");
		return { kind: "file", name, sha256, blob: new File([new Uint8Array(buffer, offset)], name, { type: mimeType }) };
	}
	if (offset === buffer.byteLength && header.kind === "text_page") return decodeTextPage(header);
	if (offset === buffer.byteLength && header.kind === "unchanged" && validHash(header.sha256))
		return { kind: "unchanged", sha256: header.sha256 };
	if (offset === buffer.byteLength && header.kind === "directory" && Array.isArray(header.entries))
		return { kind: "directory", entries: header.entries, truncated: header.truncated === true };
	throw new Error("read_failed");
}

function decodeTextPage(header: Record<string, unknown>): ConnectorFileTextPage {
	const { name, mimeType, sha256, offset, nextOffset, content, pageSha256 } = header;
	if (
		typeof name !== "string" ||
		!name ||
		typeof mimeType !== "string" ||
		!mimeType ||
		!validHash(sha256) ||
		!validHash(pageSha256) ||
		typeof offset !== "number" ||
		!Number.isSafeInteger(offset) ||
		offset < 0 ||
		typeof content !== "string"
	)
		throw new Error("read_failed");
	const length = new TextEncoder().encode(content).byteLength;
	if (
		length > MAX_PAGE_BYTES ||
		(nextOffset !== null &&
			(typeof nextOffset !== "number" ||
				!Number.isSafeInteger(nextOffset) ||
				!length ||
				nextOffset !== offset + length))
	)
		throw new Error("read_failed");
	return { kind: "text_page", name, mimeType, sha256, offset, nextOffset, content, pageSha256 };
}

export function validHash(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/** Use the current device's authorized connections to initialize native reading without a socket handshake. */
export async function prepareLocalFilePreview(
	context: LocalFilesContext,
	source: ConnectorInstance,
	authorized: readonly ConnectorInstance[],
	signal: AbortSignal,
): Promise<void> {
	const connections = authorized
		.filter(
			(item) =>
				item.deviceId === context.deviceId &&
				(item.connectorId === "local-files" || item.connectorId === "computer-control"),
		)
		.map(({ id, revision }) => ({ id, revision }));
	const matchesSource = ({ id, revision }: { id: string; revision: number }) =>
		id === source.id && revision === source.revision;
	if (source.deviceId !== context.deviceId || !connections.some(matchesSource)) throw new Error("permission_denied");
	signal.throwIfAborted();
	await invokeLocalFiles("local_files_activate", { context });
	signal.throwIfAborted();
	const ready = await invokeLocalFiles<typeof connections>("local_files_ready", { context, connections });
	signal.throwIfAborted();
	if (!ready.some(matchesSource)) throw new Error("permission_denied");
}

export async function executeLocalFilePreview(
	context: LocalFilesContext,
	command: ConnectorCommand & { expiresAtMs: number },
	signal?: AbortSignal,
): Promise<NativeFilePreview> {
	signal?.throwIfAborted();
	const cancel = () => void invokeLocalFiles("local_files_cancel", { commandId: command.id }).catch(() => {});
	signal?.addEventListener("abort", cancel, { once: true });
	try {
		const result = await invokeLocalFiles<ArrayBuffer | number[] | ConnectorCommandResult>("local_files_execute", {
			context,
			command,
		});
		signal?.throwIfAborted();
		const decode = (bytes: ArrayBuffer) => {
			const preview = decodeLocalFilePreview(bytes);
			const page = command.args?.textPage;
			if (page?.expectedSha256 && (preview.kind !== "text_page" || preview.sha256 !== page.expectedSha256))
				throw new Error("conflict");
			if (preview.kind === "text_page" && preview.offset !== page?.offset) throw new Error("read_failed");
			return preview;
		};
		if (result instanceof ArrayBuffer) return decode(result);
		// WKWebView's postMessage fallback returns raw IPC responses as JSON byte arrays.
		if (Array.isArray(result)) {
			if (result.length > MAX_ORIGINAL_BYTES + MAX_METADATA_BYTES + 4) throw new Error("too_large");
			for (const byte of result) {
				if (!Number.isInteger(byte) || byte < 0 || byte > 255) throw new Error("read_failed");
			}
			return decode(Uint8Array.from(result).buffer);
		}
		throw new Error(result.ok ? "read_failed" : result.error);
	} finally {
		signal?.removeEventListener("abort", cancel);
	}
}
