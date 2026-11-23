import type { MeResponse } from "@yonder/protocol";
import { beforeEach, expect, test, vi } from "vitest";

const mock = vi.hoisted(() => ({
	store: new Map<string, unknown>(),
	downloadFile: vi.fn(),
	reLaunch: vi.fn(async () => {}),
	unlink: vi.fn(),
	fetch: vi.fn(),
}));
vi.mock("@tarojs/taro", () => ({
	default: {
		getStorageSync: (key: string) => mock.store.get(key),
		setStorageSync: (key: string, value: unknown) => mock.store.set(key, value),
		removeStorageSync: (key: string) => mock.store.delete(key),
		getStorageInfoSync: () => ({ keys: [...mock.store.keys()] }),
		getSystemInfoSync: () => ({ language: "zh-CN", model: " iPhone  ", system: "iOS" }),
		getFileSystemManager: () => ({ unlink: mock.unlink, readFileSync: () => new ArrayBuffer(1) }),
		downloadFile: mock.downloadFile,
		reLaunch: mock.reLaunch,
	},
}));
vi.mock("./transport", () => ({ miniFetch: mock.fetch, localFile: (filePath: string) => ({ filePath }) }));
vi.mock("react", () => ({
	useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock("./realtime", () => ({
	configureRealtime() {},
	invalidateRealtime() {},
	resumeRealtime: async () => {},
	suspendRealtime() {},
	subscribeEvents() {},
	useRealtimeRevision() {
		return 0;
	},
}));

beforeEach(() => {
	vi.resetModules();
	mock.store.clear();
	mock.unlink.mockClear();
	mock.fetch.mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true }) });
});

const me = (id = "test-person") => ({ member: { id }, settings: { locale: "zh-CN" } }) as MeResponse;

test("a previous account's late attachment is discarded and its temporary file removed", async () => {
	const runtime = await import("./runtime");
	await runtime.startSession({ accessToken: "a", refreshToken: "ra", me: me() });
	let finish: (value: { statusCode: number; tempFilePath: string }) => void = () => {};
	mock.downloadFile.mockImplementation(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = runtime.downloadAttachment("att_old").catch((error: unknown) => error);
	await runtime.startSession({ accessToken: "b", refreshToken: "rb", me: me("second-person") });
	finish({ statusCode: 200, tempFilePath: "/tmp/old-account.png" });
	expect(await pending).toMatchObject({ name: "AbortError" });
	expect(mock.unlink).toHaveBeenCalledWith(expect.objectContaining({ filePath: "/tmp/old-account.png" }));
	expect(runtime.client.accessToken).toBe("b");
});

test("offline startup retains the refresh credential and foreground retries after recovery", async () => {
	mock.fetch.mockRejectedValue(new TypeError("offline"));
	const runtime = await import("./runtime");
	mock.store.set(runtime.REFRESH_STORAGE_KEY, "saved-refresh");
	await runtime.bootstrapSession();
	expect(mock.store.get(runtime.REFRESH_STORAGE_KEY)).toBe("saved-refresh");
	expect(runtime.client.accessToken).toBeNull();
	expect(runtime.useSession().status).toBe("restore-unavailable");
	mock.fetch.mockImplementation(async (url: string) => ({
		status: 200,
		ok: true,
		json: async () =>
			url.endsWith("/refresh")
				? { accessToken: "restored-access", refreshToken: "rotated-refresh" }
				: url.endsWith("/me")
					? me()
					: { ok: true },
	}));
	await runtime.resumeRealtime();
	expect(runtime.client.accessToken).toBe("restored-access");
	expect(mock.store.get(runtime.REFRESH_STORAGE_KEY)).toBe("rotated-refresh");
	expect(runtime.useSession().status).toBe("signed-in");
});

test("a mini program update during server downtime restores the saved session", async () => {
	const previous = await import("./runtime");
	await previous.startSession({ accessToken: "old-access", refreshToken: "old-refresh", me: me() });
	vi.resetModules();
	vi.stubGlobal("YONDER_APP_VERSION", "next-version");
	const runtime = await import("./runtime").finally(() => vi.unstubAllGlobals());
	mock.fetch.mockResolvedValueOnce({ status: 503, ok: false, json: async () => ({}) });
	await runtime.bootstrapSession();
	expect(runtime.useSession().status).toBe("restore-unavailable");
	expect(mock.store.get(runtime.REFRESH_STORAGE_KEY)).toBe("old-refresh");
	expect(mock.fetch).toHaveBeenLastCalledWith(
		expect.stringMatching(/\/v1\/auth\/refresh$/),
		expect.objectContaining({ headers: expect.objectContaining({ "x-client-version": "next-version" }) }),
	);

	mock.fetch
		.mockResolvedValueOnce({
			status: 200,
			ok: true,
			json: async () => ({ accessToken: "restored-access", refreshToken: "rotated-refresh" }),
		})
		.mockResolvedValueOnce({ status: 503, ok: false, json: async () => ({}) });
	await runtime.bootstrapSession();
	expect(runtime.useSession().status).toBe("restore-unavailable");
	expect(mock.store.get(runtime.REFRESH_STORAGE_KEY)).toBe("rotated-refresh");

	mock.fetch
		.mockResolvedValueOnce({
			status: 200,
			ok: true,
			json: async () => ({ accessToken: "restored-access", refreshToken: "final-refresh" }),
		})
		.mockResolvedValueOnce({ status: 200, ok: true, json: async () => me() });
	await runtime.bootstrapSession();
	expect(runtime.useSession().status).toBe("signed-in");
	expect(mock.store.get(runtime.REFRESH_STORAGE_KEY)).toBe("final-refresh");
});

test("an expired refresh credential still signs out", async () => {
	const runtime = await import("./runtime");
	mock.store.set(runtime.REFRESH_STORAGE_KEY, "expired-refresh");
	mock.fetch.mockResolvedValueOnce({
		status: 401,
		ok: false,
		json: async () => ({ error: { code: "session_revoked" } }),
	});
	await runtime.bootstrapSession();
	expect(runtime.useSession().status).toBe("signed-out");
	expect(mock.store.has(runtime.REFRESH_STORAGE_KEY)).toBe(false);
});

test("switching the API base does not send another service's refresh credential", async () => {
	const original = await import("./runtime");
	mock.store.set(original.REFRESH_STORAGE_KEY, "official-refresh");
	vi.resetModules();
	vi.stubGlobal("YONDER_API_BASE", "http://127.0.0.1:8097");
	mock.fetch.mockClear();
	try {
		const local = await import("./runtime");
		expect(local.REFRESH_STORAGE_KEY).not.toBe(original.REFRESH_STORAGE_KEY);
		await local.bootstrapSession();
		expect(mock.fetch).not.toHaveBeenCalled();
		expect(mock.store.get(original.REFRESH_STORAGE_KEY)).toBe("official-refresh");
	} finally {
		vi.unstubAllGlobals();
	}
});

test("registers the system model as the mini program's device name", async () => {
	const runtime = await import("./runtime");
	expect(runtime.deviceInfo()).toMatchObject({ platform: "miniprogram", name: "iPhone" });
});

test("signing out clears the local session even when the server refuses the request", async () => {
	const runtime = await import("./runtime");
	await runtime.startSession({ accessToken: "a", refreshToken: "ra", me: me() });
	mock.store.set("yonder.mini.draft.one", "draft");
	mock.fetch.mockResolvedValue({
		status: 500,
		ok: false,
		json: async () => ({ error: { code: "internal", message: "boom", messageKey: "errors.internal" } }),
	});
	await expect(runtime.signOut()).rejects.toMatchObject({ code: "internal" });
	expect(runtime.client.accessToken).toBeNull();
	expect(mock.store.has("yonder.mini.draft.one")).toBe(false);
	expect(mock.reLaunch).toHaveBeenCalledWith({ url: "/pages/sign-in/index" });
});
