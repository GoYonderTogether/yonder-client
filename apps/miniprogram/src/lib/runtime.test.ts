import Taro from "@tarojs/taro";
import type { MemoryDayPage, MemoryEntry, MeResponse } from "@yonder/protocol";
import { beforeEach, expect, test, vi } from "vitest";

const mock = vi.hoisted(() => ({
	store: new Map<string, unknown>(),
	files: new Map<string, number>(),
	downloadFile: vi.fn(),
	reLaunch: vi.fn(async () => {}),
	unlink: vi.fn(),
	fetch: vi.fn(),
	prepareAvatar: vi.fn(),
}));
vi.mock("@tarojs/taro", () => ({
	default: {
		getStorageSync: (key: string) => mock.store.get(key),
		setStorageSync: (key: string, value: unknown) => mock.store.set(key, value),
		removeStorageSync: (key: string) => mock.store.delete(key),
		getStorageInfoSync: () => ({ keys: [...mock.store.keys()] }),
		getSystemInfoSync: () => ({ language: "zh-CN", model: " iPhone  ", system: "iOS" }),
		env: { USER_DATA_PATH: "/data" },
		getFileSystemManager: () => ({
			unlink: (options: { filePath: string }) => {
				mock.files.delete(options.filePath);
				mock.unlink(options);
			},
			unlinkSync: (path: string) => mock.files.delete(path),
			readFileSync: () => new ArrayBuffer(1),
			mkdirSync() {},
			accessSync: (path: string) => {
				if (!mock.files.has(path)) throw new Error("missing local file");
			},
			statSync: (path: string) => ({ size: mock.files.get(path) }),
			saveFileSync: (source: string, target: string) => {
				const size = mock.files.get(source);
				if (size === undefined) throw new Error("missing temp file");
				mock.files.set(target, size);
				mock.files.delete(source);
				return target;
			},
		}),
		downloadFile: mock.downloadFile,
		reLaunch: mock.reLaunch,
	},
}));
vi.mock("./local-image", () => ({ readAvatar: mock.prepareAvatar }));
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
	mock.files.clear();
	mock.downloadFile.mockReset();
	mock.unlink.mockClear();
	mock.fetch.mockReset().mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true }) });
});

const me = (id = "test-person") => ({ member: { id }, settings: { locale: "zh-CN" } }) as MeResponse;

test("a previous account's late attachment is discarded and its temporary file removed", async () => {
	const runtime = await import("./runtime");
	await runtime.startSession({ accessToken: "a", refreshToken: "ra", me: me() });
	mock.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url: "https://media.example/old" }) });
	let finish: (value: { statusCode: number; tempFilePath: string }) => void = () => {};
	const started = new Promise<void>((start) => {
		mock.downloadFile.mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
					start();
				}),
		);
	});
	const pending = runtime
		.downloadAttachment({ id: "att_old", kind: "image", name: "old.png" })
		.catch((error: unknown) => error);
	await started;
	await runtime.startSession({ accessToken: "b", refreshToken: "rb", me: me("second-person") });
	finish({ statusCode: 200, tempFilePath: "/tmp/old-account.png" });
	expect(await pending).toMatchObject({ name: "AbortError" });
	expect(mock.unlink).toHaveBeenCalledWith(expect.objectContaining({ filePath: "/tmp/old-account.png" }));
	expect(runtime.client.accessToken).toBe("b");
});

test("downloads only the OSS thumbnail, reuses it across entry points and a restart, and clears it on sign-out", async () => {
	const runtime = await import("./runtime");
	await runtime.startSession({ accessToken: "a", refreshToken: "ra", me: me() });
	mock.fetch.mockClear();
	const thumbUrl = "https://media.example/attachment?thumb";
	mock.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url: thumbUrl }) });
	mock.files.set("/tmp/thumb", 256);
	mock.downloadFile.mockResolvedValueOnce({ statusCode: 200, tempFilePath: "/tmp/thumb" });
	const file = { id: "att_image", name: "photo.jpg", kind: "image", mimeType: "image/jpeg", size: 80_000 } as const;
	const requests = await Promise.all([
		runtime.downloadAttachment(file, "thumb"),
		runtime.downloadAttachment(file, "thumb"),
	]);
	expect(requests[0]).toContain("/data/yonder-images-v1/");
	expect(requests[0]).toBe(requests[1]);
	expect(mock.fetch).toHaveBeenCalledExactlyOnceWith(
		expect.stringMatching(/\/v1\/attachments\/att_image\/download\?variant=thumb$/),
		expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer a" }) }),
	);
	expect(mock.downloadFile.mock.calls).toEqual([[{ url: thumbUrl, withCredentials: false }]]);
	vi.resetModules();
	const restarted = await import("./runtime");
	expect(await restarted.downloadAttachment(file, "thumb")).toBe(requests[0]);
	expect(mock.fetch).toHaveBeenCalledTimes(1);
	expect(mock.downloadFile).toHaveBeenCalledTimes(1);

	const originalUrl = "https://media.example/attachment?original";
	mock.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url: originalUrl }) });
	mock.files.set("/tmp/original", 80_000);
	mock.downloadFile.mockResolvedValueOnce({ statusCode: 200, tempFilePath: "/tmp/original" });
	expect(await restarted.downloadAttachment(file)).not.toBe(requests[0]);
	expect(mock.downloadFile).toHaveBeenLastCalledWith({ url: originalUrl, withCredentials: false });
	await restarted.signOut();
	expect(mock.files.size).toBe(0);
});

test.each([
	{ id: "att_pdf", name: "agreement.pdf", kind: "file", extension: ".pdf" },
	{ id: "att_wav", name: "voice.wav", kind: "audio", extension: ".wav" },
] as const)("downloads $kind directly from OSS and reuses the local file", async ({ extension, ...file }) => {
	const runtime = await import("./runtime");
	await runtime.startSession({ accessToken: "a", refreshToken: "ra", me: me() });
	const url = "https://media.example/original?signed";
	mock.fetch.mockClear().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url }) });
	mock.files.set("/tmp/download", 123);
	mock.downloadFile.mockResolvedValueOnce({ statusCode: 200, tempFilePath: "/tmp/download" });
	const local = await runtime.downloadAttachment(file);
	expect(local.startsWith("/data/yonder-images-v1/")).toBe(true);
	expect(local.endsWith(extension)).toBe(true);
	expect(await runtime.downloadAttachment(file)).toBe(local);
	expect(mock.fetch.mock.calls.map(([address]) => new URL(address).pathname + new URL(address).search)).toEqual([
		`/v1/attachments/${file.id}/download?variant=original`,
	]);
	expect(mock.downloadFile.mock.calls).toEqual([[{ url, withCredentials: false }]]);

	vi.resetModules();
	const restarted = await import("./runtime");
	expect(await restarted.downloadAttachment(file)).toBe(local);
	expect(mock.fetch).toHaveBeenCalledTimes(1);
	expect(mock.downloadFile).toHaveBeenCalledTimes(1);

	restarted.invalidateAttachmentMedia([file.id]);
	expect(mock.files.has(local)).toBe(false);
	mock.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ url }) });
	mock.downloadFile.mockResolvedValueOnce({ statusCode: 503 });
	await expect(restarted.downloadAttachment(file)).rejects.toThrow("HTTP 503");
	expect(mock.downloadFile.mock.calls).toEqual([[{ url, withCredentials: false }], [{ url, withCredentials: false }]]);
});

test("a timeline upgrade removes secret snapshots and media but retains public cache entries", async () => {
	const runtime = await import("./runtime");
	const metadata = await import("./metadata-cache");
	await runtime.startSession({ accessToken: "a", refreshToken: "ra", me: me() });
	const secret = { id: "att_secret", kind: "image", name: "secret.jpg", mimeType: "image/jpeg", size: 123 } as const;
	const publicPhoto = { ...secret, id: "att_public", name: "public.jpg" } as const;
	function response(path: string) {
		mock.fetch.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => ({ url: "https://media.example/photo" }),
		});
		mock.files.set(path, 123);
		mock.downloadFile.mockResolvedValueOnce({ statusCode: 200, tempFilePath: path });
	}
	response("/tmp/old-secret");
	const old = await runtime.downloadAttachment(secret, "thumb");
	response("/tmp/public");
	const kept = await runtime.downloadAttachment(publicPhoto, "thumb");
	const entry = {
		id: "entry-secret",
		visibility: "secret",
		media: [{ attachment: secret, durationMs: null }],
		materials: [],
		mediaCount: 1,
		links: [],
	} as Partial<MemoryEntry>;
	const raw = {
		items: [
			{
				date: "2026-01-15",
				digest: { photos: 2 },
				blocks: [
					{ type: "entry", entry },
					{
						type: "entry",
						entry: {
							...entry,
							id: "entry-public",
							visibility: "public",
							media: [{ attachment: publicPhoto, durationMs: null }],
							links: [{ entryId: entry.id }],
						},
					},
				],
			},
		],
		nextCursor: null,
	} as MemoryDayPage;
	const key = metadata.metadataKey("test-person", "timeline");
	mock.store.set(key, { data: raw, savedAt: Date.now() });
	expect(metadata.readSnapshot<MemoryDayPage>(key)?.data.items[0]?.blocks).toHaveLength(1);
	vi.resetModules();
	const restarted = await import("./runtime");
	expect(JSON.stringify(mock.store.get(key))).not.toContain("entry-secret");
	expect(mock.files.has(old)).toBe(false);
	expect(await restarted.downloadAttachment(publicPhoto, "thumb")).toBe(kept);
	response("/tmp/session-secret");
	expect(await restarted.downloadAttachment(secret, "thumb", false)).toBe("/tmp/session-secret");
	const indexes = [...mock.store.entries()].filter(([name]) => name.startsWith("yonder.mini.images.v1."));
	expect(JSON.stringify(indexes)).not.toContain(secret.id);
	metadata.writeSnapshot(key, raw);
	expect(JSON.stringify(mock.store.get(key))).not.toContain("entry-secret");
});

test("offline startup retains the refresh credential and foreground retries after recovery", async () => {
	mock.fetch.mockRejectedValue(new TypeError("offline"));
	const previous = await import("./runtime");
	mock.store.set(previous.REFRESH_STORAGE_KEY, "saved-refresh");
	vi.resetModules();
	const runtime = await import("./runtime");
	expect(runtime.useSession()).toMatchObject({ status: "signed-in", memberId: null, me: null });
	await runtime.bootstrapSession();
	expect(mock.store.get(runtime.REFRESH_STORAGE_KEY)).toBe("saved-refresh");
	expect(runtime.client.accessToken).toBeNull();
	expect(runtime.useSession().status).toBe("signed-in");
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
	expect(runtime.useSession()).toMatchObject({ status: "signed-in", memberId: "test-person", me: null });
	mock.fetch.mockResolvedValueOnce({ status: 503, ok: false, json: async () => ({}) });
	await runtime.bootstrapSession();
	expect(runtime.useSession().status).toBe("signed-in");
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
	expect(runtime.useSession()).toMatchObject({ status: "signed-in", memberId: "test-person", me: null });
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
	const previous = await import("./runtime");
	await previous.startSession({ accessToken: "old-access", refreshToken: "old-refresh", me: me() });
	vi.resetModules();
	const runtime = await import("./runtime");
	mock.fetch.mockResolvedValueOnce({
		status: 401,
		ok: false,
		json: async () => ({ error: { code: "session_revoked" } }),
	});
	await runtime.bootstrapSession();
	expect(runtime.useSession()).toMatchObject({ status: "signed-out", memberId: null, me: null });
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

test.each(["outbox storage inventory", "outbox row"])(
	"signing out still clears the session when %s cannot be read",
	async (failure) => {
		const runtime = await import("./runtime");
		await runtime.startSession({ accessToken: "a", refreshToken: "ra", me: me() });
		const key = "yonder.mini.outbox.test-person.one";
		mock.store.set(key, []);
		const broken = vi.spyOn(Taro, failure === "outbox row" ? "getStorageSync" : "getStorageInfoSync");
		const failRead = () => {
			throw new Error("storage read failed");
		};
		if (failure === "outbox row") broken.mockImplementationOnce(failRead);
		else broken.mockImplementation(failRead);
		try {
			await runtime.signOut();
		} finally {
			broken.mockRestore();
		}
		expect(runtime.useSession().status).toBe("signed-out");
		expect(runtime.client.accessToken).toBeNull();
		expect(mock.store.has(runtime.REFRESH_STORAGE_KEY)).toBe(false);
		if (failure === "outbox row") expect(mock.store.has(key)).toBe(false);
	},
);

test("own and Bot avatar uploads use only the prepared bytes and retain the correct routes", async () => {
	const runtime = await import("./runtime");
	await runtime.startSession({ accessToken: "a", refreshToken: "ra", me: me() });
	mock.fetch.mockClear();
	mock.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => me() });
	const prepared = new Uint8Array([0xff, 0xd8, 0xff]).buffer;
	mock.prepareAvatar.mockResolvedValue({ bytes: prepared, contentType: "image/jpeg" });
	await runtime.uploadAvatar({ path: "/tmp/own-original" });
	await runtime.uploadBotAvatar("bot_1", { path: "/tmp/bot-original" });
	expect(mock.prepareAvatar.mock.calls.slice(-2)).toEqual([
		[{ path: "/tmp/own-original" }],
		[{ path: "/tmp/bot-original" }],
	]);
	expect(mock.fetch.mock.calls.map(([url, options]) => [new URL(url).pathname, options.body])).toEqual([
		["/v1/me/avatar", prepared],
		["/v1/bots/bot_1/avatar", prepared],
	]);
});

test("switching accounts during Bot avatar compression does not send under the new identity", async () => {
	const runtime = await import("./runtime");
	await runtime.startSession({ accessToken: "a", refreshToken: "ra", me: me() });
	let finish: (value: object) => void = () => {};
	mock.prepareAvatar.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = runtime.uploadBotAvatar("bot_1", { path: "/tmp/old-owner-photo" }).catch((error) => error);
	await runtime.startSession({ accessToken: "b", refreshToken: "rb", me: me("new-owner") });
	mock.fetch.mockClear();
	finish({ bytes: new ArrayBuffer(1), contentType: "image/jpeg" });
	expect(await pending).toMatchObject({ name: "AbortError" });
	expect(mock.fetch).not.toHaveBeenCalled();
});
