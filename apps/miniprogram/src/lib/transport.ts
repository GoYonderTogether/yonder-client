import Taro from "@tarojs/taro";
import type { ApiResponse } from "@yonder/api-client";
import { decodeFileText } from "./device-file-bytes";

export interface LocalFile {
	filePath: string;
	formData?: Record<string, string>;
}

export function localFile(filePath: string, formData?: Record<string, string>): BodyInit {
	return { filePath, formData } as unknown as BodyInit;
}

export type MiniResponse = ApiResponse & { bytes: ArrayBuffer | null };

function response(status: number, data: unknown, header: Record<string, unknown> = {}): MiniResponse {
	const headers = new Map(Object.entries(header).map(([key, value]) => [key.toLowerCase(), String(value)]));
	const bytes = data instanceof ArrayBuffer ? data : null;
	return {
		status,
		ok: status >= 200 && status < 300,
		headers: { get: (key) => headers.get(key.toLowerCase()) ?? null },
		bytes,
		async json() {
			return bytes ? JSON.parse(decodeFileText(bytes)) : typeof data === "string" ? JSON.parse(data) : data;
		},
		async blob(): Promise<Blob> {
			throw new Error("Use downloadAttachment for native files");
		},
	};
}

/** Only the fetch surface consumed by ApiClient: no global DOM polyfills. */
export async function miniFetch(url: string, init: RequestInit): Promise<ApiResponse> {
	const header = init.headers as Record<string, string>;
	if (init.signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
	const file =
		init.body && typeof init.body === "object" && "filePath" in init.body ? (init.body as unknown as LocalFile) : null;
	let abort: (() => void) | undefined;
	const filePreview = /\/v1\/connectors\/[^/]+\/file-preview$/u.test(url);
	try {
		return await new Promise<ApiResponse>((resolve, reject) => {
			const callbacks = {
				success: (result: { statusCode: number; data: unknown; header?: Record<string, unknown> }) =>
					resolve(response(result.statusCode, result.data, result.header)),
				fail: (error: { errMsg: string }) =>
					reject(
						init.signal?.aborted
							? Object.assign(new Error("Aborted"), { name: "AbortError" })
							: new Error(error.errMsg),
					),
			};
			const task = file
				? Taro.uploadFile({ url, header, filePath: file.filePath, name: "file", formData: file.formData, ...callbacks })
				: Taro.request({
						url,
						header,
						method: (init.method ?? "GET") as "GET",
						data: init.body as string | undefined,
						...(filePreview ? { responseType: "arraybuffer" as const, dataType: "other" } : {}),
						...callbacks,
					});
			// Taro invokes callbacks and also rejects its task Promise. Consume that parallel rejection.
			void Promise.resolve(task).catch(() => {});
			abort = () => task.abort();
			init.signal?.addEventListener("abort", abort, { once: true });
		});
	} finally {
		if (abort) init.signal?.removeEventListener("abort", abort);
	}
}
