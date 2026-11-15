import Taro from "@tarojs/taro";
import type { ApiResponse } from "@yonder/api-client";

export interface LocalFile {
	filePath: string;
	formData?: Record<string, string>;
}

export function localFile(filePath: string, formData?: Record<string, string>): BodyInit {
	return { filePath, formData } as unknown as BodyInit;
}

function response(status: number, data: unknown): ApiResponse {
	return {
		status,
		ok: status >= 200 && status < 300,
		async json() {
			return typeof data === "string" ? JSON.parse(data) : data;
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
	try {
		return await new Promise<ApiResponse>((resolve, reject) => {
			const callbacks = {
				success: (result: { statusCode: number; data: unknown }) => resolve(response(result.statusCode, result.data)),
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
