import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useTopNoticeTarget } from "../app/app-notice.tsx";
import { useForeground } from "../lib/foreground.ts";
import { browserBeta, releasePath } from "./channel-path.ts";
import { useOfferedUpdate, useUpdater, useUpdateSettings } from "./provider.tsx";
import type { Updater, UpdateState } from "./state.ts";
import type { UpdateOffer } from "./update-offer.ts";
import "./top-notice.css";

type Guard = { recording: boolean; busy: () => boolean; persist: () => Promise<boolean> };

const IDLE: UpdateState = { status: "idle" };
const readIdle = () => IDLE;
const subscribeIdle = () => () => {};

async function openTestFlight(url: string) {
	const { invoke } = await import("@tauri-apps/api/core");
	await invoke<void>("plugin:opener|open_url", { url });
}

export function UpdateTopNotice(guard: Guard) {
	const target = useTopNoticeTarget();
	const context = useOfferedUpdate();
	const channel = useUpdateSettings()?.state.data?.channel;
	const latest = useRef(guard);
	latest.current = guard;
	const returnToStable = channel === "stable" && browserBeta(window.location.pathname);
	useEffect(() => {
		if (!returnToStable) return;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout>;
		async function leave() {
			if (cancelled) return;
			const blocked = () => latest.current.recording || latest.current.busy();
			const ready = !blocked() && (await latest.current.persist().catch(() => false));
			if (cancelled) return;
			if (ready && !blocked()) window.location.replace(releasePath("stable", window.location));
			else timer = setTimeout(() => void leave(), 1000);
		}
		void leave();
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [returnToStable]);
	const updater = useUpdater();
	const offer = context?.offer;
	const snapshot = useSyncExternalStore(
		updater?.subscribe ?? subscribeIdle,
		updater?.getSnapshot ?? readIdle,
		readIdle,
	);
	const attempted = useRef<UpdateOffer | undefined>(undefined);
	const native = offer?.platform === "macos" || offer?.platform === "windows" || offer?.platform === "android";

	useEffect(() => {
		if (!native || !offer || !updater || attempted.current === offer) return;
		if (snapshot.status === "checking" || snapshot.status === "downloading" || snapshot.status === "installing") return;
		attempted.current = offer;
		if (
			snapshot.version === offer.version &&
			(snapshot.status === "installerOpened" || (snapshot.notice && snapshot.status === "ready"))
		)
			return;
		void updater.check(offer.version);
	}, [native, offer, updater, snapshot]);

	if (!context || !offer || (native && !updater)) return null;
	if (native && snapshot.version === offer.version && snapshot.status === "installerOpened") return null;
	const ready =
		snapshot.version === offer.version &&
		(snapshot.status === "ready" || snapshot.status === "installing" || snapshot.error === "install");
	const action = native
		? ready
			? offer.platform === "android"
				? "androidInstall"
				: "noticeRestart"
			: "noticeDownload"
		: offer.platform === "web"
			? offer.channel === "beta" && !browserBeta(window.location.pathname)
				? "noticeBeta"
				: "noticeReload"
			: "noticeTestFlight";
	if (!target) return null;
	return createPortal(
		<TopNotice
			key={offer.id}
			offer={offer}
			guard={guard}
			action={action}
			dismiss={context.dismiss}
			acknowledge={context.acknowledge}
			updater={native ? updater : null}
		/>,
		target,
	);
}

function TopNotice({
	offer,
	guard,
	action,
	acknowledge,
	dismiss,
	updater,
}: {
	offer: UpdateOffer;
	guard: Guard;
	action: "noticeRestart" | "androidInstall" | "noticeDownload" | "noticeReload" | "noticeBeta" | "noticeTestFlight";
	acknowledge: (offer: UpdateOffer) => void;
	dismiss: (id: string) => void;
	updater: Updater | null;
}) {
	const { t } = useTranslation();
	const focused = useForeground();
	const latest = useRef(guard);
	latest.current = guard;
	const mounted = useRef(false);
	const inFlight = useRef(false);
	const element = useRef<HTMLElement>(null);
	const start = useRef<{ pointer: number; x: number; y: number } | undefined>(undefined);
	const [working, setWorking] = useState(false);

	useLayoutEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	useEffect(() => {
		if (!focused || guard.recording || offer.platform !== "android") return;
		const paint = requestAnimationFrame(() => {
			const notice = element.current;
			const box = notice?.getBoundingClientRect();
			if (
				box &&
				notice?.contains(document.elementFromPoint?.(box.left + box.width / 2, box.top + box.height / 2) ?? null)
			)
				acknowledge(offer);
		});
		return () => cancelAnimationFrame(paint);
	}, [focused, offer, acknowledge, guard.recording]);

	useEffect(() => {
		const up = (event: PointerEvent) => {
			const point = start.current;
			if (!point || event.pointerId !== point.pointer) return;
			start.current = undefined;
			const dy = point.y - event.clientY;
			if (!inFlight.current && dy > 24 && Math.abs(point.x - event.clientX) < dy) dismiss(offer.id);
		};
		const cancel = () => {
			start.current = undefined;
		};
		document.addEventListener("pointerup", up);
		document.addEventListener("pointercancel", cancel);
		return () => {
			document.removeEventListener("pointerup", up);
			document.removeEventListener("pointercancel", cancel);
		};
	}, [dismiss, offer.id]);

	async function update() {
		const blocked = () => latest.current.recording || latest.current.busy();
		if (inFlight.current || blocked()) return;
		inFlight.current = true;
		setWorking(true);
		try {
			if (updater && !(await updater.prepare(offer.version))) return;
			if (!mounted.current || blocked()) return;
			if (offer.platform === "web" || offer.platform === "macos" || offer.platform === "windows") {
				if (!(await latest.current.persist()) || !mounted.current || blocked()) return;
			}
			if (offer.platform === "web") {
				dismiss(offer.id);
				const channel = offer.channel === "beta" ? "beta" : "stable";
				if (browserBeta(window.location.pathname) === (channel === "beta")) window.location.reload();
				else window.location.assign(releasePath(channel, window.location));
			} else if (offer.platform === "ios" && offer.url) {
				await openTestFlight(offer.url);
				if (mounted.current) dismiss(offer.id);
			} else if ((await updater?.install(offer.version)) && mounted.current && offer.platform !== "android") {
				dismiss(offer.id);
			}
		} catch {
			// Leave the same action available for retry, without dismissing or reloading.
		} finally {
			inFlight.current = false;
			if (mounted.current) setWorking(false);
		}
	}

	return (
		<aside
			className="update-top-notice app-notice-surface"
			ref={element}
			aria-label={t("me.update.notice")}
			onPointerDown={(event) => {
				if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest("button")) return;
				start.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
				event.preventDefault();
			}}
		>
			<h2>{t("me.update.notice")}</h2>
			<div className="update-top-notice__actions">
				<button
					type="button"
					className="update-top-notice__primary"
					disabled={working || guard.recording || guard.busy()}
					onClick={() => void update()}
				>
					{t(`me.update.${action}`)}
				</button>
				<button type="button" className="update-top-notice__later" disabled={working} onClick={() => dismiss(offer.id)}>
					{t("me.update.noticeLater")}
				</button>
			</div>
		</aside>
	);
}
