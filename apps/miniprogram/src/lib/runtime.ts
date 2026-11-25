import Taro from "@tarojs/taro";
import { ApiClient, createEndpoints } from "@yonder/api-client";
import type { Attachment, DeviceInfo, Member, MeResponse } from "@yonder/protocol";
import { deviceTimeZone } from "@yonder/ui-time";
import { useSyncExternalStore } from "react";
import { setLocale } from "./i18n";
import { type ChosenImage, readAvatar } from "./local-image";
import { upsertOwnedBot } from "./member-cache";
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
const memberIdStorageKey = `yonder.mini.member.${encodeURIComponent(baseUrl)}`;
// Unscoped development credentials have no trustworthy server binding.
Taro.removeStorageSync("yonder.mini.refresh");
const getRefreshToken = (): string | null => Taro.getStorageSync(REFRESH_STORAGE_KEY) || null;
const hasSavedSession = Boolean(getRefreshToken());
let savedMemberId: string | null = (hasSavedSession && Taro.getStorageSync(memberIdStorageKey)) || null;
let accessToken: string | null = null;
const listeners = new Set<() => void>();
let cachedBots: readonly Member[] = [];
let session: { status: "booting" | "signed-out" | "signed-in"; me: MeResponse | null } = {
	status: hasSavedSession ? "signed-in" : "booting",
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
	if (next.me?.member.id !== session.me?.member.id) cachedBots = [];
	session = next;
	for (const listener of [...listeners]) listener();
}

function publishMe(me: MeResponse): void {
	if (savedMemberId !== me.member.id) {
		savedMemberId = me.member.id;
		try {
			Taro.setStorageSync(memberIdStorageKey, savedMemberId);
		} catch {
			// The member ID is still available to this running session.
		}
	}
	setLocale(me.settings.locale);
	publish({ status: "signed-in", me });
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
		getRefreshToken,
		setRefreshToken: (value) => {
			if (value) Taro.setStorageSync(REFRESH_STORAGE_KEY, value);
			else {
				Taro.removeStorageSync(REFRESH_STORAGE_KEY);
				Taro.removeStorageSync(memberIdStorageKey);
				savedMemberId = null;
			}
		},
	},
	onSessionLost: clearLocal,
});
const endpoints = createEndpoints(client);
export const api = {
	...endpoints,
	async contacts() {
		const expected = generation;
		const result = await endpoints.contacts();
		assertCurrent(expected);
		if (session.me) {
			const ownerId = session.me.member.id;
			cachedBots = result.items
				.filter((member) => member.kind === "bot" && member.ownerId === ownerId)
				.map((member) => {
					const current = cachedBots.find((bot) => bot.id === member.id);
					return current && current.version > member.version ? current : member;
				});
			publish(session);
		}
		return result;
	},
};

configureRealtime({
	baseUrl,
	token: () => client.accessToken,
	refresh: () => client.refreshSession(),
	lost: clearLocal,
});

subscribeEvents((event) => {
	const me = session.me;
	if (!me) return;
	if (event.type === "member.removed" && cachedBots.some((bot) => bot.id === event.memberId)) {
		cachedBots = cachedBots.filter((bot) => bot.id !== event.memberId);
		publish(session);
	}
	if (
		event.type === "member.updated" &&
		session.me?.member.id === event.member.id &&
		session.me.member.version <= event.member.version
	) {
		publish({ ...session, me: { ...session.me, member: event.member } });
	}
	if (event.type === "member.updated" && event.member.kind === "bot" && event.member.ownerId === me.member.id) {
		const current = cachedBots.find((bot) => bot.id === event.member.id);
		if (!current || current.version <= event.member.version)
			cachedBots = upsertOwnedBot([...cachedBots], event.member, me.member.id);
		publish(
			me.bot.id === event.member.id && me.bot.version <= event.member.version
				? { ...session, me: { ...me, bot: event.member } }
				: session,
		);
	}
});

export function deviceInfo(): DeviceInfo & { installationId: string } {
	const model = Taro.getSystemInfoSync().model?.trim();
	const key = "yonder.mini.installation";
	let installationId = Taro.getStorageSync(key);
	if (!installationId) {
		installationId = newNonce();
		Taro.setStorageSync(key, installationId);
	}
	return {
		installationId,
		name: model && model.length <= 128 ? model : "WeChat",
		platform: "miniprogram",
		appVersion,
		// This phone's own zone and system language, so a new account starts where its owner is;
		// a `manual` account keeps them only as the hint (migration 127).
		timezone: deviceTimeZone(),
		locale: /^zh\b|^zh-/iu.test(Taro.getSystemInfoSync().language ?? "en") ? "zh-CN" : "en",
	};
}

export async function resumeRealtime(): Promise<void> {
	if (session.status === "booting" || (!session.me && getRefreshToken())) {
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
	publishMe(me);
}

export async function startSession(value: {
	accessToken: string;
	refreshToken?: string;
	me?: MeResponse;
}): Promise<void> {
	clearLocal();
	client.setSession(value);
	if (value.me) publishMe(value.me);
	else await refreshMe();
	await api.registerDevice(deviceInfo()).catch(() => {});
	await connectRealtime();
	invalidateRealtime();
}

let bootstrapping: Promise<void> | undefined;
export function bootstrapSession(): Promise<void> {
	bootstrapping ??= (async () => {
		const expected = generation;
		if (!(await client.refreshSession())) {
			if (expected === generation && !getRefreshToken()) publish({ status: "signed-out", me: null });
			return;
		}
		try {
			assertCurrent(expected);
			await refreshMe();
			await api.registerDevice(deviceInfo()).catch(() => {});
			if (expected === generation) await connectRealtime();
		} catch {
			/* Keep the stored sign-in available until the server rejects it. */
		}
	})().finally(() => {
		bootstrapping = undefined;
	});
	return bootstrapping;
}

export async function signOut(): Promise<void> {
	// The local sign-in must go even when the server cannot be reached: a person who chose to sign
	// out is not left signed in because the network failed or the session was already revoked.
	try {
		await api.signOut();
	} finally {
		clearLocal();
		await Taro.reLaunch({ url: "/pages/sign-in/index" });
	}
}

function subscribeSession(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useCachedBots(): readonly Member[] {
	return useSyncExternalStore(subscribeSession, () => cachedBots);
}

export function useSession() {
	const snapshot = useSyncExternalStore(subscribeSession, () => session);
	const memberId = snapshot.status === "signed-in" ? savedMemberId : null;
	return { ...snapshot, memberId, startSession, signOut, refreshMe };
}

export function uploadAttachment(
	filePath: string,
	clientNonce = newNonce(),
	signal?: AbortSignal,
): Promise<Attachment> {
	return client.request("/v1/attachments", {
		raw: { bytes: localFile(filePath, { clientNonce }) },
		idempotencyKey: clientNonce,
		...(signal ? { signal } : {}),
	});
}

export function transcribeAudio(filePath: string): Promise<{ text: string }> {
	return client.request("/v1/audio/transcriptions", { raw: { bytes: localFile(filePath) } });
}

export async function uploadAvatar(file: ChosenImage): Promise<MeResponse> {
	const expected = generation;
	const { bytes, contentType } = await readAvatar(file);
	assertCurrent(expected);
	const me = await client.request<MeResponse>("/v1/me/avatar", { raw: { bytes, contentType } });
	assertCurrent(expected);
	publish({ status: "signed-in", me });
	return me;
}

export async function uploadBotAvatar(id: string, file: ChosenImage): Promise<Member> {
	const expected = generation;
	const { bytes, contentType } = await readAvatar(file);
	assertCurrent(expected);
	const bot = await client.request<Member>(`/v1/bots/${encodeURIComponent(id)}/avatar`, {
		raw: { bytes, contentType },
	});
	assertCurrent(expected);
	return bot;
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
