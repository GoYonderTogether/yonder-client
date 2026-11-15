import { expect, test, vi } from "vitest";

const mock = vi.hoisted(() => ({ request: vi.fn(), uploadFile: vi.fn() }));
vi.mock("@tarojs/taro", () => ({ default: mock }));

import { localFile, miniFetch } from "./transport";

test("JSON and multipart use native tasks while preserving status for shared auth handling", async () => {
	mock.request.mockImplementation((options) => {
		options.success({ statusCode: 401, data: { error: { code: "unauthenticated" } } });
		return { abort() {} };
	});
	const denied = await miniFetch("https://example.test/v1/me", { headers: { authorization: "Bearer expired" } });
	expect(denied.status).toBe(401);
	expect(denied.ok).toBe(false);
	mock.uploadFile.mockImplementation((options) => {
		options.success({ statusCode: 200, data: '{"id":"att_1"}' });
		return { abort() {} };
	});
	const uploaded = await miniFetch("https://example.test/v1/attachments", {
		headers: { "idempotency-key": "nonce-1" },
		body: localFile("/tmp/photo.png", { clientNonce: "nonce-1" }),
	});
	expect(await uploaded.json()).toEqual({ id: "att_1" });
	expect(mock.uploadFile.mock.calls[0]?.[0]).toMatchObject({
		name: "file",
		filePath: "/tmp/photo.png",
		formData: { clientNonce: "nonce-1" },
	});
});

test("an aborted upload cancels the native task", async () => {
	const abort = vi.fn();
	mock.uploadFile.mockImplementation((options) => {
		let rejectTask: (error: unknown) => void = () => {};
		const task = new Promise((_resolve, reject) => {
			rejectTask = reject;
		});
		return Object.assign(task, {
			abort() {
				abort();
				options.fail({ errMsg: "aborted" });
				rejectTask({ errMsg: "aborted" });
			},
		});
	});
	const controller = new AbortController();
	const pending = miniFetch("https://example.test/upload", {
		headers: {},
		body: localFile("/tmp/image.png"),
		signal: controller.signal,
	});
	controller.abort();
	await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	expect(abort).toHaveBeenCalledOnce();
});
