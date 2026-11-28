import type { DeviceInfo, SignInResponse, WechatWebAttempt } from "@yonder/protocol";
import { Button, ListRow } from "@yonder/ui-components";
import { useWechatWebActions, useWechatWebEnabled } from "@yonder/ui-data";
import { useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	isWechatAuthorizationReady,
	supportsCommerce,
	wechatAuthorizationFrameUrl,
	wechatAuthorizationOrigin,
} from "../lib/commerce-url.ts";
import { apiBaseUrl } from "../lib/config.ts";
import { isTauri } from "../lib/keychain.ts";
import { useCommerceRequest } from "../lib/use-commerce-request.ts";
import { CommerceDialog } from "./commerce-dialog.tsx";

type Props =
	| { mode: "link" }
	| {
			mode: "sign-in";
			device: DeviceInfo;
			disabled: boolean;
			onSignedIn: (result: SignInResponse) => Promise<void>;
	  };

type Phase =
	| "starting"
	| "ready"
	| "pending"
	| "expired"
	| "failed"
	| "unlinked"
	| "linked"
	| "checkingFailed"
	| "loadFailed"
	| "finishing";
type Attempt = Pick<WechatWebAttempt, "ticket"> & { frameUrl: string; expiresAt: number };

export function WechatWebEntry(props: Props) {
	const { t, i18n } = useTranslation();
	const enabled = useWechatWebEnabled(supportsCommerce());
	const { start, status, refreshAccount } = useWechatWebActions();
	const { run, cancel } = useCommerceRequest();
	const [open, setOpen] = useState(false);
	const [phase, setPhase] = useState<Phase>("starting");
	const [attempt, setAttempt] = useState<Attempt>();
	const frame = useRef<HTMLIFrameElement>(null);
	const stopWaiting = useRef<(() => void) | undefined>(undefined);
	const linking = props.mode === "link";
	const title = t(linking ? "commerce.wechat.link" : "commerce.wechat.signIn");
	const ready = useEffectEvent(watch);

	useLayoutEffect(() => {
		if (!enabled || !open || !attempt || phase !== "ready") return;
		const current = attempt;
		const source = frame.current?.contentWindow ?? null;
		const expiresAt = current.expiresAt;
		function receive(event: MessageEvent) {
			if (!isWechatAuthorizationReady(event, source)) return;
			cleanup();
			if (Date.now() >= expiresAt) setPhase("expired");
			else ready(current);
		}
		function cleanup() {
			window.removeEventListener("message", receive);
			clearTimeout(timer);
		}
		// Subscribe during the iframe's mount commit, before it can post an early ready event.
		window.addEventListener("message", receive);
		const timer = setTimeout(
			() => {
				cleanup();
				setPhase(Date.now() >= expiresAt ? "expired" : "loadFailed");
			},
			Math.min(15_000, Math.max(0, expiresAt - Date.now())),
		);
		stopWaiting.current = cleanup;
		return cleanup;
	}, [attempt, enabled, open, phase]);

	function begin() {
		setOpen(true);
		setAttempt(undefined);
		setPhase("starting");
		run(
			(signal) => start(linking, signal),
			(result) => {
				const apiOrigin = new URL(apiBaseUrl({ shell: isTauri(), dev: import.meta.env.DEV }) || location.origin).origin;
				const english = (i18n.resolvedLanguage ?? i18n.language).split("-")[0] === "en";
				const frameUrl = wechatAuthorizationFrameUrl(result.authorizeUrl, apiOrigin, english);
				if (!frameUrl || !result.ticket || !Number.isFinite(result.expiresIn) || result.expiresIn <= 0) {
					setPhase("failed");
					return;
				}
				setAttempt({ ticket: result.ticket, frameUrl, expiresAt: Date.now() + result.expiresIn * 1000 });
				setPhase("ready");
			},
			() => setPhase("failed"),
		);
	}

	function watch(ticket: Attempt) {
		setPhase("pending");
		run(
			(signal) => status(ticket.ticket, linking, props.mode === "sign-in" ? props.device : undefined, signal),
			(result) => {
				switch (result.status) {
					case "pending":
						if (Date.now() < ticket.expiresAt) return 2000;
						setPhase("expired");
						break;
					case "signed_in":
						if (props.mode === "sign-in" && result.accessToken) {
							setPhase("finishing");
							void props.onSignedIn(result).catch(() => setPhase("failed"));
						} else setPhase("failed");
						break;
					case "linked":
						setPhase(linking ? "linked" : "failed");
						if (linking) void refreshAccount();
						break;
					case "expired":
					case "failed":
					case "unlinked":
						setPhase(result.status);
						break;
					default:
						setPhase("failed");
				}
			},
			() => setPhase("checkingFailed"),
		);
	}

	if (!enabled) return null;
	return (
		<>
			{props.mode === "link" ? (
				<ListRow title={title} onClick={begin} chevron />
			) : (
				<Button className="self-start" variant="link" disabled={props.disabled} onClick={begin}>
					{title}
				</Button>
			)}
			<CommerceDialog
				open={open}
				onClose={() => {
					if (phase === "finishing") return;
					stopWaiting.current?.();
					cancel();
					setOpen(false);
					setAttempt(undefined);
				}}
				title={title}
			>
				{phase !== "ready" && (
					<p role={phase.endsWith("Failed") || phase === "failed" ? "alert" : "status"}>
						{t(`commerce.wechat.${phase}`)}
					</p>
				)}
				{open && attempt && (phase === "ready" || phase === "pending" || phase === "checkingFailed") ? (
					<iframe
						key={attempt.ticket}
						ref={frame}
						src={attempt.frameUrl}
						title={t("commerce.wechat.authorizationFrame")}
						width={300}
						height={400}
						className="self-center max-w-full"
						allow={`local-network-access ${wechatAuthorizationOrigin}`}
						sandbox="allow-scripts allow-same-origin allow-top-navigation-to-custom-protocols"
						referrerPolicy="no-referrer"
					/>
				) : null}
				{attempt && phase === "checkingFailed" ? (
					<Button onClick={() => watch(attempt)} className="self-start">
						{t("commerce.checkAgain")}
					</Button>
				) : null}
				{phase === "expired" || phase === "failed" || phase === "loadFailed" ? (
					<Button onClick={begin} className="self-start">
						{t("app.retry")}
					</Button>
				) : null}
			</CommerceDialog>
		</>
	);
}
