import Taro from "@tarojs/taro";
import { ApiClient, createEndpoints } from "@yonder/api-client";
import type { Attachment, DeviceInfo, MeResponse } from "@yonder/protocol";
import { useSyncExternalStore } from "react";
import { setLocale } from "./i18n";
import {
	configureRealtime,
	resumeRealtime as connectRealtime,
	invalidateRealtime,
	subscribeEvents,
	suspendRealtime,
} from "./realtime";
import { localFile, miniFetch } from "./transport";

export { subscribeEvents, suspendRealtime, useRealtimeRevision } from "./realtime";

const baseUrl = typeof YONDER_API_BASE === "undefined" ? "https://yonder.zethai.cn" : YONDER_API_BASE;
const appVersion = typeof YONDER_APP_VERSION === "undefined" ? "0.3.26111505" : YONDER_APP_VERSION;
export const REFRESH_STORAGE_KEY = `yonder.mini.refresh.${encodeURIComponent(baseUrl)}`;
// Unscoped development credentials have no trustworthy server binding.
Taro.removeStorageSync("yonder.mini.refresh");
let accessToken: string | null = null;
const listeners = new Set<() => void>();
let session: { status: "booting" | "signed-out" | "signed-in"; me: MeResponse | null } = {
	status: "booting",
	me: null,
};
const downloaded = new Map<string, string>();
let generation = 0;

function assertCurrent(expected: number): void {
	if (expected !== generation) throw Object.assign(new Error("session changed"), { name: "AbortError" });
}

/** Correlation/idempotency only; authentication tokens are always server generated. */
export function newNonce(): string {
	return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

function publish(next: typeof session): void {
	session = next;
	for (const listener of [...listeners]) listener();
}

function removeDownloaded(filePath: string): void {
	if (process.env.TARO_ENV === "h5") URL.revokeObjectURL(filePath);
	else Taro.getFileSystemManager().unlink({ filePath, fail() {} });
}

function clearLocal(): void {
	generation += 1;
	suspendRealtime();
	client.clearTokens();
	for (const filePath of downloaded.values()) removeDownloaded(filePath);
	downloaded.clear();
	const storage = Taro.getStorageInfoSync();
	for (const key of storage.keys)
		if (key.startsWith("yonder.mini.draft.") || key.startsWith("yonder.mini.outbox.")) Taro.removeStorageSync(key);
	publish({ status: "signed-out", me: null });
}

export const client = new ApiClient({
	baseUrl,
	appVersion,
	clientKind: "miniprogram",
	requestId: newNonce,
	fetch: miniFetch,
	tokens: {
		getAccessToken: () => accessToken,
		setAccessToken: (value) => {
			accessToken = value;
		},
		getRefreshToken: () => Taro.getStorageSync(REFRESH_STORAGE_KEY) || null,
		setRefreshToken: (value) => {
			if (value) Taro.setStorageSync(REFRESH_STORAGE_KEY, value);
			else Taro.removeStorageSync(REFRESH_STORAGE_KEY);
		},
	},
	onSessionLost: clearLocal,
});
export const api = createEndpoints(client);

configureRealtime({
	baseUrl,
	token: () => client.accessToken,
	refresh: () => client.refreshSession(),
	lost: clearLocal,
});

subscribeEvents((event) => {
	if (
		event.type === "member.updated" &&
		session.me?.member.id === event.member.id &&
		session.me.member.version <= event.member.version
	) {
		publish({ ...session, me: { ...session.me, member: event.member } });
	}
});

export function deviceInfo(): DeviceInfo & { installationId: string } {
	const info = Taro.getSystemInfoSync();
	const key = "yonder.mini.installation";
	let installationId = Taro.getStorageSync(key);
	if (!installationId) {
		installationId = newNonce();
		Taro.setStorageSync(key, installationId);
	}
	return {
		installationId,
		name: `WeChat · ${info.model}`,
		platform: "miniprogram",
		appVersion,
	};
}

export async function resumeRealtime(): Promise<void> {
	if (session.status === "booting" || (session.status !== "signed-in" && Taro.getStorageSync(REFRESH_STORAGE_KEY))) {
		await bootstrapSession();
		return;
	}
	if (session.status !== "signed-in") return;
	try {
		await refreshMe();
		await connectRealtime();
	} catch {
		/* A failed network request does not revoke a session. */
	}
}

export async function refreshMe(): Promise<void> {
	const expected = generation;
	const me = await api.me();
	assertCurrent(expected);
	setLocale(me.settings.locale);
	publish({ status: "signed-in", me });
}

export async function startSession(value: {
	accessToken: string;
	refreshToken?: string;
	me?: MeResponse;
}): Promise<void> {
	clearLocal();
	client.setSession(value);
	if (value.me) {
		setLocale(value.me.settings.locale);
		publish({ status: "signed-in", me: value.me });
	} else await refreshMe();
	await api.registerDevice(deviceInfo()).catch(() => {});
	await connectRealtime();
	invalidateRealtime();
}

let bootstrapping: Promise<void> | undefined;
export function bootstrapSession(): Promise<void> {
	bootstrapping ??= (async () => {
		const expected = generation;
		if (!(await client.refreshSession())) {
			if (expected === generation) publish({ status: "signed-out", me: null });
			return;
		}
		try {
			await refreshMe();
			await api.registerDevice(deviceInfo()).catch(() => {});
			await connectRealtime();
		} catch {
			if (expected === generation) publish({ status: "signed-out", me: null });
		}
	})().finally(() => {
		bootstrapping = undefined;
	});
	return bootstrapping;
}

export async function signOut(): Promise<void> {
	await api.signOut();
	clearLocal();
	await Taro.reLaunch({ url: "/pages/sign-in/index" });
}

export function useSession() {
	const snapshot = useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		() => session,
	);
	return { ...snapshot, startSession, signOut, refreshMe };
}

export function uploadAttachment(filePath: string, clientNonce = newNonce()): Promise<Attachment> {
	return client.request("/v1/attachments", {
		raw: { bytes: localFile(filePath, { clientNonce }) },
		idempotencyKey: clientNonce,
	});
}

export function transcribeAudio(filePath: string): Promise<{ text: string }> {
	return client.request("/v1/audio/transcriptions", { raw: { bytes: localFile(filePath) } });
}

export async function uploadAvatar(filePath: string): Promise<MeResponse> {
	const expected = generation;
	let bytes: ArrayBuffer;
	let contentType: string;
	if (process.env.TARO_ENV === "h5") {
		const file = await (await fetch(filePath)).blob();
		bytes = await file.arrayBuffer();
		contentType = file.type || "application/octet-stream";
	} else {
		bytes = Taro.getFileSystemManager().readFileSync(filePath) as ArrayBuffer;
		const image = await Taro.getImageInfo({ src: filePath });
		contentType = `image/${image.type === "jpg" ? "jpeg" : image.type}`;
	}
	assertCurrent(expected);
	const me = await client.request<MeResponse>("/v1/me/avatar", { raw: { bytes, contentType } });
	assertCurrent(expected);
	publish({ status: "signed-in", me });
	return me;
}

export async function downloadAttachment(id: string): Promise<string> {
	const expected = generation;
	const key = `${expected}:${id}`;
	const cached = downloaded.get(key);
	if (cached) return cached;
	const get = () =>
		Taro.downloadFile({
			url: `${baseUrl}/v1/attachments/${encodeURIComponent(id)}/content`,
			header: { authorization: `Bearer ${client.accessToken}` },
		});
	let result = await get();
	if (result.statusCode === 401 && (await client.refreshSession())) result = await get();
	if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(`HTTP ${result.statusCode}`);
	if (expected !== generation) {
		removeDownloaded(result.tempFilePath);
		assertCurrent(expected);
	}
	downloaded.set(key, result.tempFilePath);
	return result.tempFilePath;
}
