import Taro from "@tarojs/taro";
import { ApiClient, ApiError, createEndpoints, NetworkError } from "@yonder/api-client";
import type { Attachment, ConnectorFilePreviewStatus, DeviceInfo, Member, MeResponse } from "@yonder/protocol";
import { useSyncExternalStore } from "react";
import { type DeviceFile, verifyDeviceFile } from "./device-file-bytes";
import { setLocale } from "./i18n";
import { mediaCache, removeMediaFile } from "./image-cache";
import { type ChosenImage, readAvatar } from "./local-image";
import { upsertOwnedBot } from "./member-cache";
import { MINI_CACHE_PREFIX, purgeSecretTimelineSnapshots, updateMetadataForEvent } from "./metadata-cache";
import {
	configureRealtime,
	resumeRealtime as connectRealtime,
	invalidateRealtime,
	subscribeEvents,
	suspendRealtime,
} from "./realtime";
import { localFile, type MiniResponse, miniFetch } from "./transport";

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
let media: { owner: string; cache: ReturnType<typeof mediaCache> } | undefined;
let lastDeviceFile: { key: string; file: DeviceFile } | undefined;
let deviceFileGeneration = 0;
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
		purgeSecretTimelineSnapshots(savedMemberId, invalidateAttachmentMedia);
		try {
			Taro.setStorageSync(memberIdStorageKey, savedMemberId);
		} catch {
			// The member ID is still available to this running session.
		}
	}
	setLocale(me.settings.locale);
	publish({ status: "signed-in", me });
}

function clearLocal(): void {
	generation += 1;
	suspendRealtime();
	if (savedMemberId) memberMedia(savedMemberId).remove(() => true);
	media = undefined;
	client.clearTokens();
	clearDeviceFileCache();
	const storage = Taro.getStorageInfoSync();
	for (const key of storage.keys)
		if (
			key.startsWith("yonder.mini.draft.") ||
			key.startsWith("yonder.mini.outbox.") ||
			key.startsWith(MINI_CACHE_PREFIX)
		)
			Taro.removeStorageSync(key);
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
	if (event.type === "connectors.changed") clearDeviceFileCache();
	if (savedMemberId) updateMetadataForEvent(savedMemberId, event, invalidateAttachmentMedia, clearConversationMedia);
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

const attachmentMediaKey = (id: string) => `attachment:${encodeURIComponent(id)}:`;

function memberMedia(owner: string) {
	if (media?.owner !== owner) media = { owner, cache: mediaCache(`${baseUrl}:${owner}`) };
	return media.cache;
}

export function invalidateAttachmentMedia(ids: Iterable<string>): void {
	if (!savedMemberId) return;
	const prefixes = Array.from(ids, attachmentMediaKey);
	if (prefixes.length) memberMedia(savedMemberId).remove((key) => prefixes.some((prefix) => key.startsWith(prefix)));
}

if (savedMemberId) purgeSecretTimelineSnapshots(savedMemberId, invalidateAttachmentMedia);

function clearConversationMedia(): void {
	if (savedMemberId) memberMedia(savedMemberId).remove((key) => key.startsWith("attachment:"));
}

async function downloadMedia(url: string): Promise<string> {
	const result = await Taro.downloadFile({ url, withCredentials: false });
	if (result.statusCode !== 200 || !result.tempFilePath) {
		if (result.tempFilePath) removeMediaFile(result.tempFilePath);
		throw new Error(`HTTP ${result.statusCode}`);
	}
	return result.tempFilePath;
}

export function downloadAttachment(
	file: Pick<Attachment, "id" | "kind" | "name">,
	variant: "thumb" | "original" = "original",
	persistent = true,
): Promise<string> {
	if (!savedMemberId || (variant === "thumb" && file.kind !== "image"))
		return Promise.reject(new Error("attachment unavailable"));
	const expected = generation;
	return memberMedia(savedMemberId)
		.get(
			`${attachmentMediaKey(file.id)}${variant === "thumb" ? "thumb-v1" : variant}${persistent ? "" : ":session"}`,
			async () => {
				assertCurrent(expected);
				const { url } = await api.attachmentDownload(file.id, variant);
				assertCurrent(expected);
				if (url === null) {
					// Local object storage returns no direct URL. Keep this temp file private to this loader.
					const contentUrl = `${baseUrl}/v1/attachments/${encodeURIComponent(file.id)}/content`;
					const get = () =>
						Taro.downloadFile({ url: contentUrl, header: { authorization: `Bearer ${client.accessToken}` } });
					let result = await get();
					if (result.statusCode === 401 && (await client.refreshSession())) {
						assertCurrent(expected);
						result = await get();
					}
					if (result.statusCode === 200 && result.tempFilePath) return result.tempFilePath;
					if (result.tempFilePath) removeMediaFile(result.tempFilePath);
					throw new Error(`HTTP ${result.statusCode}`);
				}
				if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("invalid attachment URL");
				return downloadMedia(url);
			},
			variant === "thumb" ? undefined : /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1],
			persistent,
		)
		.then((path) => {
			assertCurrent(expected);
			return path;
		});
}

export function downloadAvatarImage(src: string): Promise<string> {
	if (!savedMemberId) return Promise.reject(new Error("image unavailable"));
	const url = src.startsWith("/") && !src.startsWith("//") ? `${baseUrl}${src}` : src;
	if (!url.startsWith("https://") && !(baseUrl?.startsWith("http://") && url.startsWith(`${baseUrl}/files/`)))
		return Promise.reject(new Error("invalid image URL"));
	return memberMedia(savedMemberId).get(`avatar:${url}`, () => downloadMedia(url));
}

export function clearDeviceFileCache() {
	deviceFileGeneration += 1;
	lastDeviceFile = undefined;
}

export async function downloadDeviceFile(
	connectionId: string,
	path: string,
	signal?: AbortSignal,
): Promise<Extract<ConnectorFilePreviewStatus, { kind: "directory" }> | (DeviceFile & { stale?: boolean })> {
	const expected = generation;
	const expectedFiles = deviceFileGeneration;
	const key = JSON.stringify([connectionId, path]);
	const cached = lastDeviceFile?.key === key ? lastDeviceFile.file : undefined;
	try {
		const response = await client.request<MiniResponse>(
			`/v1/connectors/${encodeURIComponent(connectionId)}/file-preview`,
			{
				body: { path, ...(cached ? { knownSha256: cached.sha256 } : {}) },
				responseType: "response",
				signal,
			},
		);
		assertCurrent(expected);
		if (signal?.aborted || expectedFiles !== deviceFileGeneration) throw new Error("file read superseded");
		const hash = response.headers?.get("x-yonder-file-sha256");
		if (!hash) {
			const status = (await response.json()) as ConnectorFilePreviewStatus;
			if (status?.kind === "unchanged" && cached && status.sha256 === cached.sha256) return cached;
			if (status?.kind === "directory" && Array.isArray(status.entries)) return status;
			throw new Error("invalid device file response");
		}
		const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(response.headers?.get("content-disposition") ?? "")?.[1];
		if (!response.bytes || !encodedName || !verifyDeviceFile(response.bytes, hash))
			throw new Error("file checksum failed");
		const file = {
			kind: "file" as const,
			name: decodeURIComponent(encodedName),
			mime: response.headers?.get("content-type")?.split(";")[0] ?? "application/octet-stream",
			bytes: response.bytes,
			sha256: hash,
		};
		// ponytail: keep at most one small verified file in memory until app restart or sign-out.
		lastDeviceFile = file.bytes.byteLength <= 8 * 1024 * 1024 ? { key, file } : undefined;
		return file;
	} catch (error) {
		assertCurrent(expected);
		if (signal?.aborted || expectedFiles !== deviceFileGeneration) throw error;
		if (cached && (error instanceof NetworkError || (error instanceof ApiError && error.status === 503)))
			return { ...cached, stale: true };
		if (lastDeviceFile?.key === key) lastDeviceFile = undefined;
		throw error;
	}
}
