import { ApiError } from "@yonder/api-client";
import { type ReleaseChannel, useData } from "@yonder/ui-data";
import { useCallback, useEffect, useRef, useState } from "react";
import { BUILD_VERSION, NATIVE_BUILD_CHANNEL } from "../lib/config.ts";
import { browserBeta } from "./channel-path.ts";
import { compareVersions } from "./version.ts";

const PATH = "/v1/devices/update";
const PLATFORMS = ["web", "macos", "windows", "android", "ios"] as const;
export type UpdateOfferPlatform = (typeof PLATFORMS)[number];
type Channel = ReleaseChannel | "testflight-internal";
export type UpdateOffer = {
	id: string;
	version: string;
	platform: UpdateOfferPlatform;
	channel: Channel;
	url?: string;
	manifest?: Record<string, unknown>;
};

export function updateOfferChannel(platform: UpdateOfferPlatform, choice: ReleaseChannel = "stable"): Channel | null {
	if (platform !== "ios") return choice;
	return choice === "beta" ? "testflight-internal" : null;
}

export function installedReleaseChannel(platform: string): ReleaseChannel {
	if (platform === "web") return browserBeta(window.location.pathname) ? "beta" : "stable";
	return NATIVE_BUILD_CHANNEL;
}

export function trustedTestFlightUrl(value: unknown): string | undefined {
	if (typeof value !== "string" || !/^https:\/\/testflight\.apple\.com\/join\/[A-Za-z0-9]{8}$/.test(value)) return;
	return value;
}

export function readUpdateOffer(
	value: unknown,
	platform: string,
	channel: Channel,
	current = BUILD_VERSION,
	installedChannel: ReleaseChannel = "stable",
): UpdateOffer | null {
	if (!PLATFORMS.some((item) => item === platform)) return null;
	const raw = (value as { release?: unknown } | null)?.release;
	if (!raw || typeof raw !== "object") return null;
	const data = raw as Partial<UpdateOffer>;
	if (
		typeof data.id !== "string" ||
		!/^[A-Za-z0-9:._-]{1,128}$/.test(data.id) ||
		data.platform !== platform ||
		!(data.channel === channel || (channel === "beta" && data.channel === "stable")) ||
		typeof data.version !== "string" ||
		data.version.length > 48
	)
		return null;
	try {
		const order = compareVersions(data.version, current);
		const returning =
			installedChannel === "beta" &&
			data.channel === "stable" &&
			(platform === "web" || platform === "macos" || platform === "windows");
		if (order === 0 || (order < 0 && !returning)) return null;
	} catch {
		return null;
	}
	const url = platform === "ios" ? trustedTestFlightUrl(data.url) : undefined;
	if (platform === "ios" && !url) return null;
	const manifest =
		data.manifest && typeof data.manifest === "object" && !Array.isArray(data.manifest) ? data.manifest : undefined;
	return {
		id: data.id,
		version: data.version,
		platform: data.platform,
		channel: data.channel,
		...(url ? { url } : {}),
		...(manifest ? { manifest } : {}),
	};
}

/** A socket event is a hint, never an installer URL; the authenticated endpoint is authoritative. */
export function useUpdateOffer(owner: string | undefined, platform: string, choice: ReleaseChannel) {
	const { client, realtime, storage } = useData();
	const channel = PLATFORMS.some((item) => item === platform)
		? updateOfferChannel(platform as UpdateOfferPlatform, choice)
		: null;
	const installedChannel = installedReleaseChannel(platform);
	const scope = owner && channel ? `${owner}:${platform}:${BUILD_VERSION}:${channel}` : null;
	const readOffer = useCallback(
		async (signal?: AbortSignal) => {
			if (!scope || !channel) return null;
			const path = `${PATH}?channel=${channel}${installedChannel === "beta" ? "&installedChannel=beta" : ""}`;
			try {
				const reply = await client.request<unknown>(path, { ...(signal ? { signal } : {}) });
				return readUpdateOffer(reply, platform, channel, BUILD_VERSION, installedChannel);
			} catch (error) {
				if (error instanceof ApiError && error.status === 404) return null;
				throw error;
			}
		},
		[client, scope, channel, installedChannel, platform],
	);
	const dismissal = scope ? `update-notice.dismissed.${scope}` : null;
	const [result, setResult] = useState<{ scope: string; offer: UpdateOffer | null }>();
	const [dismissed, setDismissed] = useState<{ scope: string; id: string }>();
	const acknowledged = useRef(new Set<string>());
	useEffect(() => {
		if (!scope || !channel) return;
		const controller = new AbortController();
		let running = false;
		let pending = false;
		let sawOpen = realtime.status === "open";
		const check = async () => {
			if (controller.signal.aborted) return;
			if (running) {
				pending = true;
				return;
			}
			running = true;
			try {
				const offer = await readOffer(controller.signal);
				if (!controller.signal.aborted) setResult({ scope, offer });
			} catch {
				if (!controller.signal.aborted && (channel !== "stable" || installedChannel === "beta"))
					setResult({ scope, offer: null });
			} finally {
				running = false;
				if (pending) {
					pending = false;
					void check();
				}
			}
		};
		const unStatus = realtime.subscribe(() => {
			if (realtime.status !== "open") return;
			if (sawOpen) void check();
			sawOpen = true;
		});
		const unEvent = realtime.subscribeEvents((event) => {
			if (event.type === "device.update.available") void check();
		});
		const foreground = () => {
			if (
				document.visibilityState === "visible" &&
				(platform === "android" || channel !== "stable" || installedChannel === "beta")
			)
				void check();
		};
		// Android's installer-ready OS notification opens/resumes the same app, not a chat route.
		document.addEventListener("visibilitychange", foreground);
		void check();
		return () => {
			controller.abort();
			unStatus();
			unEvent();
			document.removeEventListener("visibilitychange", foreground);
		};
	}, [realtime, scope, channel, installedChannel, platform, readOffer]);

	const refresh = useCallback(async () => {
		const offer = await readOffer();
		if (scope) setResult({ scope, offer });
		return offer;
	}, [readOffer, scope]);

	const offer = result && result.scope === scope ? result.offer : null;
	const dismissalId =
		(dismissed?.scope === dismissal ? dismissed?.id : undefined) ?? (dismissal ? storage.get(dismissal) : null);
	const visible = offer?.id === dismissalId ? null : offer;
	const acknowledge = useCallback(
		(offer: UpdateOffer) => {
			if (!scope || offer.platform !== "android") return;
			const key = `${scope}:${offer.id}`;
			if (acknowledged.current.has(key)) return;
			acknowledged.current.add(key);
			void client
				.request(PATH, { method: "POST", body: { channel: offer.channel, releaseId: offer.id } })
				.catch(() => acknowledged.current.delete(key));
		},
		[client, scope],
	);
	const dismiss = useCallback(
		(id: string) => {
			if (!dismissal) return;
			setDismissed({ scope: dismissal, id });
			storage.set(dismissal, id);
		},
		[dismissal, storage],
	);
	return { offer: visible, dismiss, acknowledge, readOffer, refresh };
}
