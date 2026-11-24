import { ArrowUpFromLine } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useForeground } from "../lib/foreground.ts";
import { useOfferedUpdate, useUpdater } from "./provider.tsx";
import type { UpdateState } from "./state.ts";
import type { UpdateOffer } from "./update-offer.ts";
import "./top-notice.css";

type Detail = "preparing" | "recording" | "busy" | "draft" | "failed";
type Guard = { recording: boolean; busy: () => boolean; persist: () => Promise<boolean> };

const IDLE: UpdateState = { status: "idle" };
const readIdle = () => IDLE;
const subscribeIdle = () => () => {};

async function openTestFlight(url: string) {
	const { invoke } = await import("@tauri-apps/api/core");
	await invoke<void>("plugin:opener|open_url", { url });
}

export function UpdateTopNotice(guard: Guard) {
	const context = useOfferedUpdate();
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

	if (
		!context ||
		!offer ||
		(native &&
			(!updater ||
				snapshot.version !== offer.version ||
				!(snapshot.status === "ready" || snapshot.status === "installing" || snapshot.error === "install")))
	)
		return null;

	return (
		<TopNotice
			key={offer.id}
			offer={offer}
			guard={guard}
			dismiss={context.dismiss}
			acknowledge={context.acknowledge}
			install={updater?.install}
		/>
	);
}

function TopNotice({
	offer,
	guard,
	acknowledge,
	dismiss,
	install,
}: {
	offer: UpdateOffer;
	guard: Guard;
	acknowledge: (offer: UpdateOffer) => void;
	dismiss: (id: string) => void;
	install?: ((version: string) => Promise<boolean>) | undefined;
}) {
	const { t } = useTranslation();
	const focused = useForeground();
	const latest = useRef(guard);
	latest.current = guard;
	const mounted = useRef(false);
	const inFlight = useRef(false);
	const element = useRef<HTMLElement>(null);
	const start = useRef<{ pointer: number; x: number; y: number } | undefined>(undefined);
	const [detail, setDetail] = useState<Detail>();
	const shownDetail = detail === "recording" && !guard.recording ? undefined : detail;

	useLayoutEffect(() => {
		mounted.current = true;
		const notice = element.current;
		const sync = () => {
			if (notice)
				document.documentElement.style.setProperty(
					"--yonder-update-notice-offset",
					`${notice.offsetTop + notice.offsetHeight + 6}px`,
				);
		};
		sync();
		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
		if (notice) observer?.observe(notice);
		window.addEventListener("resize", sync);
		return () => {
			mounted.current = false;
			observer?.disconnect();
			window.removeEventListener("resize", sync);
			document.documentElement.style.removeProperty("--yonder-update-notice-offset");
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
		if (inFlight.current) return;
		if (latest.current.recording) return setDetail("recording");
		if (latest.current.busy()) return setDetail("busy");
		inFlight.current = true;
		try {
			if (offer.platform === "web" || offer.platform === "macos" || offer.platform === "windows") {
				setDetail("preparing");
				const saved = await latest.current.persist();
				if (!mounted.current) return;
				if (latest.current.recording) return setDetail("recording");
				if (latest.current.busy()) return setDetail("busy");
				if (!saved) return setDetail("draft");
			}
			if (offer.platform === "web") {
				dismiss(offer.id);
				window.location.reload();
			} else if (offer.platform === "ios" && offer.url) {
				await openTestFlight(offer.url);
				if (mounted.current) dismiss(offer.id);
			} else if (await install?.(offer.version)) {
				if (mounted.current && offer.platform !== "android") dismiss(offer.id);
			} else if (mounted.current) setDetail("failed");
		} catch {
			if (mounted.current) setDetail("failed");
		} finally {
			inFlight.current = false;
		}
	}

	return createPortal(
		<aside
			className="update-top-notice"
			ref={element}
			aria-label={t("me.update.notice")}
			onPointerDown={(event) => {
				if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest("button")) return;
				start.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY };
				event.preventDefault();
			}}
		>
			<div className="update-top-notice__lead">
				<ArrowUpFromLine className="update-top-notice__icon" aria-hidden="true" size={18} />
				<h2>{t("me.update.notice")}</h2>
			</div>
			<div className="update-top-notice__actions">
				<button
					type="button"
					className="update-top-notice__primary"
					disabled={shownDetail === "preparing" || shownDetail === "recording"}
					onClick={() => void update()}
				>
					{t("me.update.noticeUpdate")}
				</button>
				<button
					type="button"
					className="update-top-notice__later"
					disabled={shownDetail === "preparing"}
					onClick={() => dismiss(offer.id)}
				>
					{t("me.update.noticeLater")}
				</button>
			</div>
			{shownDetail ? <p role="status">{t(`me.update.noticeDetail.${shownDetail}`)}</p> : null}
		</aside>,
		document.body,
	);
}
