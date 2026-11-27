import type { ConnectorCommand, ConnectorCommandResult, ConnectorFilePreviewStatus } from "@yonder/protocol";
import { invokeLocalFiles, type LocalFilesContext } from "./local-files.ts";

const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;

export type NativeFilePreview = ConnectorFilePreviewStatus | { kind: "file"; sha256: string; name: string; blob: File };

/** Same small metadata prefix used by the Apple resources bridge, followed by the exact original. */
export function decodeLocalFilePreview(buffer: ArrayBuffer): NativeFilePreview {
	if (buffer.byteLength < 5) throw new Error("read_failed");
	const headerLength = new DataView(buffer).getUint32(0);
	const offset = 4 + headerLength;
	if (!headerLength || headerLength > 512 * 1024 || offset > buffer.byteLength) throw new Error("read_failed");
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
	if (offset === buffer.byteLength && header.kind === "unchanged" && validHash(header.sha256))
		return { kind: "unchanged", sha256: header.sha256 };
	if (offset === buffer.byteLength && header.kind === "directory" && Array.isArray(header.entries))
		return { kind: "directory", entries: header.entries, truncated: header.truncated === true };
	throw new Error("read_failed");
}

export function validHash(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
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
		const result = await invokeLocalFiles<ArrayBuffer | ConnectorCommandResult>("local_files_execute", {
			context,
			command,
		});
		signal?.throwIfAborted();
		if (result instanceof ArrayBuffer) return decodeLocalFilePreview(result);
		throw new Error(result.ok ? "read_failed" : result.error);
	} finally {
		signal?.removeEventListener("abort", cancel);
	}
}
