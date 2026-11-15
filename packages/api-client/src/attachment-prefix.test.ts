import { createServer } from "node:http";
import { expect, test } from "vitest";
import { ApiClient } from "./client.ts";
import { createEndpoints } from "./endpoints.ts";

test("sends the exact Range through the real HTTP transport and returns only the 4096-byte 206 prefix", async () => {
	const source = Buffer.alloc(8192, "x");
	const requests: { range: string | undefined; authorization: string | undefined }[] = [];
	const server = createServer((request, response) => {
		requests.push({ range: request.headers.range, authorization: request.headers.authorization });
		if (request.headers.range !== "bytes=0-4095") {
			response.writeHead(200);
			response.end(source);
			return;
		}
		response.writeHead(206, { "content-type": "text/plain", "content-range": `bytes 0-4095/${source.length}` });
		response.end(source.subarray(0, 4096));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("test HTTP port missing");
		const api = createEndpoints(
			new ApiClient({
				baseUrl: `http://127.0.0.1:${address.port}`,
				clientKind: "web",
				appVersion: "test",
				tokens: { getAccessToken: () => "prefix-protocol-token", setAccessToken: () => {} },
			}),
		);
		const prefix = await api.attachmentPrefix("att_protocol");
		expect(prefix.size).toBe(4096);
		expect(new Uint8Array(await prefix.arrayBuffer())).toEqual(new Uint8Array(source.subarray(0, 4096)));
		expect(requests).toEqual([{ range: "bytes=0-4095", authorization: "Bearer prefix-protocol-token" }]);
	} finally {
		await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	}
});

test("rejects a native transport's non-partial response without requiring a Fetch stream or reading its Blob", async () => {
	for (const body of [
		undefined,
		null,
		new ReadableStream<Uint8Array<ArrayBuffer>>({ cancel() {} }),
		new ReadableStream<Uint8Array<ArrayBuffer>>({
			cancel() {
				throw new Error("native body already closed");
			},
		}),
	]) {
		const api = createEndpoints(
			new ApiClient({
				baseUrl: "https://native.example.test",
				clientKind: "shell",
				appVersion: "test",
				tokens: { getAccessToken: () => "native-token", setAccessToken: () => {} },
				requestId: () => "native-prefix",
				fetch: async () => ({
					status: 200,
					ok: true,
					json: async () => ({}),
					blob: async () => {
						throw new Error("whole native Blob must not be read");
					},
					...(body === undefined ? {} : { body }),
				}),
			}),
		);
		await expect(api.attachmentPrefix("att_native")).rejects.toMatchObject({ name: "ApiError", status: 502 });
	}
});
