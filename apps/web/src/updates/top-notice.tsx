import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useTopNoticeTarget } from "../app/app-notice.tsx";
import { useForeground } from "../lib/foreground.ts";
import { useOfferedUpdate, useUpdater } from "./provider.tsx";
import type { Updater, UpdateState } from "./state.ts";
import type { UpdateOffer } from "./update-offer.ts";
import { compareVersions } from "./version.ts";
import "./top-notice.css";

type Guard = { recording: boolean; busy: () => boolean; persist: () => Promise<boolean> };

const IDLE: UpdateState = { status: "idle" };
const readIdle = () => IDLE;
const subscribeIdle = () => () => {};

async function openTestFlight(url: string) {
	const { invoke } = await import("@tauri-apps/api/core");
	await invoke<void>("plugin:opener|open_url", { url });
}

/**
 * True when the updater is already working on this offer or something newer — a startup check
 * usually found it first. Re-checking then would drop a download that is already running.
 */
function covered(offer: UpdateOffer, state: UpdateState) {
	if (!state.version) return false;
	try {
		if (compareVersions(state.version, offer.version) < 0) return false;
	} catch {
		return false;
	}
	return state.status === "downloading" || state.status === "installing" || isStaged(state);
}

function isStaged(state: UpdateState) {
	return state.status === "ready" || state.status === "installerOpened" || state.error === "install";
}

export function UpdateTopNotice(guard: Guard) {
	const target = useTopNoticeTarget();
	const context = useOfferedUpdate();
	const updater = useUpdater();
	const offer = context?.offer;
	const snapshot = useSyncExternalStore(
		updater?.subscribe ?? subscribeIdle,
		updater?.getSnapshot ?? readIdle,
		readIdle,
	);
	const attempted = useRef<string | undefined>(undefined);
	const native = offer?.platform === "macos" || offer?.platform === "windows" || offer?.platform === "android";

	/*
	 * Verify the offer through the updater instead of trusting the server's version. Asked as a
	 * notice, the check stages whatever the signed feed has newest and announces it here, so a
	 * build published while the offer was in flight replaces it rather than being skipped. The
	 * sidebar's quieter control stays hidden because this check carries the notice flag. The
	 * updater serialises this behind any check already running.
	 */
	useEffect(() => {
		if (!native || !offer || !updater) return;
		if (attempted.current === offer.id) return;
		attempted.current = offer.id;
		// A launch check, a return to the window, or an earlier offer already staged this build.
		if (covered(offer, updater.getSnapshot())) return;
		// Android pins the version because its package download is part of verifying the offer;
		// the desktop feed is read for whatever is newest, which may be ahead of the offer.
		void updater.check(offer.platform === "android" ? offer.version : undefined, true);
	}, [native, offer, updater]);

	if (!context || !offer || (native && !updater)) return null;
	// One version drives the label, the check and the install: whatever the updater has staged,
	// or the offer's own version until the first check answers.
	const version = (native && snapshot.version) || offer.version;
	if (native && snapshot.version === version && snapshot.status === "installerOpened") return null;
	const ready =
		native &&
		snapshot.version === version &&
		(snapshot.status === "ready" || snapshot.status === "installing" || snapshot.error === "install");
	const action = native
		? ready
			? offer.platform === "android"
				? "androidInstall"
				: "noticeRestart"
			: "noticeDownload"
		: offer.platform === "web"
			? "noticeReload"
			: "noticeTestFlight";
	if (!target) return null;
	return createPortal(
		<TopNotice
			key={offer.id}
			offer={offer}
			version={version}
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
	version,
	guard,
	action,
	acknowledge,
	dismiss,
	updater,
}: {
	offer: UpdateOffer;
	version: string;
	guard: Guard;
	action: "noticeRestart" | "androidInstall" | "noticeDownload" | "noticeReload" | "noticeTestFlight";
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
			/*
			 * Act on the version on screen, never on whatever happens to be staged. If the feed has
			 * moved past it since, prepare refuses; the follow-up check stages the newest build and
			 * the label changes with it, so the next click installs exactly what it names.
			 */
			if (updater && !(await updater.prepare(version))) {
				await updater.check();
				return;
			}
			if (!mounted.current || blocked()) return;
			if (offer.platform === "web" || offer.platform === "macos" || offer.platform === "windows") {
				if (!(await latest.current.persist()) || !mounted.current || blocked()) return;
			}
			if (offer.platform === "web") {
				dismiss(offer.id);
				window.location.reload();
			} else if (offer.platform === "ios" && offer.url) {
				await openTestFlight(offer.url);
				if (mounted.current) dismiss(offer.id);
			} else if ((await updater?.install(version)) && mounted.current && offer.platform !== "android") {
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
			<h2>{t("me.update.noticeVersion", { version })}</h2>
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
