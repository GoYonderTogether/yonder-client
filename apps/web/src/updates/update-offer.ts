import { ApiError } from "@yonder/api-client";
import { useData } from "@yonder/ui-data";
import { useCallback, useEffect, useRef, useState } from "react";
import { BUILD_VERSION } from "../lib/config.ts";
import { compareVersions } from "./version.ts";

const PATH = "/v1/devices/update";
const PLATFORMS = ["web", "macos", "windows", "android", "ios"] as const;
export type UpdateOfferPlatform = (typeof PLATFORMS)[number];
type Channel = "stable" | "testflight-internal";
export type UpdateOffer = {
	id: string;
	version: string;
	platform: UpdateOfferPlatform;
	channel: Channel;
	url?: string;
};

export function updateOfferChannel(platform: UpdateOfferPlatform): Channel | null {
	return platform !== "ios"
		? "stable"
		: import.meta.env.VITE_YONDER_UPDATE_CHANNEL === "testflight-internal"
			? "testflight-internal"
			: null;
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
): UpdateOffer | null {
	if (!PLATFORMS.some((item) => item === platform)) return null;
	const raw = (value as { release?: unknown } | null)?.release;
	if (!raw || typeof raw !== "object") return null;
	const data = raw as Partial<UpdateOffer>;
	if (
		typeof data.id !== "string" ||
		!/^[A-Za-z0-9:._-]{1,128}$/.test(data.id) ||
		data.platform !== platform ||
		data.channel !== channel ||
		typeof data.version !== "string" ||
		data.version.length > 48
	)
		return null;
	try {
		if (compareVersions(data.version, current) <= 0) return null;
	} catch {
		return null;
	}
	const url = platform === "ios" ? trustedTestFlightUrl(data.url) : undefined;
	if (platform === "ios" && !url) return null;
	return { id: data.id, version: data.version, platform: data.platform, channel, ...(url ? { url } : {}) };
}

/** A socket event is a hint, never an installer URL; the authenticated endpoint is authoritative. */
export function useUpdateOffer(owner: string | undefined, platform: string) {
	const { client, realtime, storage } = useData();
	const channel = PLATFORMS.some((item) => item === platform)
		? updateOfferChannel(platform as UpdateOfferPlatform)
		: null;
	const scope = owner && channel ? `${owner}:${platform}:${BUILD_VERSION}` : null;
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
				const reply = await client.request<unknown>(`${PATH}?channel=${channel}`, { signal: controller.signal });
				if (!controller.signal.aborted) setResult({ scope, offer: readUpdateOffer(reply, platform, channel) });
			} catch (error) {
				if (!controller.signal.aborted && error instanceof ApiError && error.status === 404)
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
			if (platform === "android" && document.visibilityState === "visible") void check();
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
	}, [client, realtime, scope, channel, platform]);

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
	return { offer: visible, dismiss, acknowledge };
}
