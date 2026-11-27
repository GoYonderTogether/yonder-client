import { Button, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { ApiError } from "@yonder/api-client";
import { AuthActions, type AuthHost } from "@yonder/auth-presentation";
import type { ResolveInviteResponse, SignInResponse } from "@yonder/protocol";
import { useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { api, deviceInfo } from "../../lib/runtime";

const AuthView = View as unknown as AuthHost;

function inviteError(error: unknown): string {
	const code = error instanceof ApiError ? error.code : null;
	switch (code) {
		case "invite_invalid":
			return t("邀请码无效，请检查或换一个。", "That invitation code is invalid. Check it or try another.");
		case "invite_full":
			return t("这个邀请的名额已用完，请换一个邀请码。", "This invitation is full. Try another code.");
		case "invite_expired":
			return t("这个邀请已过期，请换一个邀请码。", "This invitation has expired. Try another code.");
		case "invite_disabled":
			return t("这个邀请已停用，请换一个邀请码。", "This invitation was disabled. Try another code.");
		case "invite_ticket_expired":
			return t("身份验证已过期，请重新验证。", "Your verification has expired. Verify again to continue.");
		default:
			return t("没能加入内测，请重试。", "Could not join the beta. Try again.");
	}
}

export function InviteActivation({
	ticket,
	prefill,
	onSignedIn,
	onSwitchAccount,
}: {
	ticket: string;
	prefill: string;
	onSignedIn: (result: SignInResponse) => Promise<void>;
	onSwitchAccount: () => void;
}) {
	const [code, setCode] = useState(prefill);
	const [resolved, setResolved] = useState<ResolveInviteResponse | null>(null);
	const [previewError, setPreviewError] = useState<unknown>(null);
	const [failure, setFailure] = useState<unknown>(null);
	const [pasteHint, setPasteHint] = useState(false);
	const [busy, setBusy] = useState(false);
	const request = useRef(false);
	const original = code.trim() === prefill;
	const expired = failure instanceof ApiError && failure.code === "invite_ticket_expired";
	const error = failure ?? (original ? previewError : null);
	useEffect(() => {
		if (!prefill) return;
		let active = true;
		void api.resolveInvite(prefill).then(
			(result) => {
				if (active) setResolved(result);
			},
			(error) => {
				if (active && error instanceof ApiError) setPreviewError(error);
			},
		);
		return () => {
			active = false;
		};
	}, [prefill]);
	function update(value: string) {
		setCode(value);
		setFailure(null);
		setPasteHint(false);
	}
	async function join() {
		if (request.current || expired || !code.trim()) return;
		request.current = true;
		setBusy(true);
		setFailure(null);
		try {
			await onSignedIn(await api.redeemInvite({ ticket, code: code.trim(), device: deviceInfo() }));
		} catch (error) {
			setFailure(error);
		} finally {
			request.current = false;
			setBusy(false);
		}
	}
	return (
		<>
			<View>
				<View className="mini-auth-invite-label">
					<Text className="mini-auth-label">{t("邀请码", "Invitation code")}</Text>
					<Button
						className="mini-auth-link mini-auth-invite-action"
						disabled={busy || expired || undefined}
						onClick={() => {
							void Taro.getClipboardData({
								success: ({ data }) => update(data.trim()),
								fail: () => setPasteHint(true),
							});
						}}
					>
						{t("粘贴", "Paste")}
					</Button>
				</View>
				<Input
					id="beta-invite-code"
					className="auth-control mini-auth-input"
					ariaLabel={t("邀请码", "Invitation code")}
					value={code}
					onInput={(event) => update(event.detail.value)}
					disabled={busy || expired || undefined}
				/>
			</View>
			{pasteHint ? <Text>{t("可在输入框中直接粘贴邀请码。", "Paste the invitation code into the field.")}</Text> : null}
			{original && resolved ? (
				<Text>
					{resolved.kind === "official"
						? t("Yonder 官方邀请", "Official Yonder invitation")
						: t(`由 ${resolved.inviter.displayName} 邀请`, `Invited by ${resolved.inviter.displayName}`)}
				</Text>
			) : null}
			{error ? <Text className="mini-auth-error">{inviteError(error)}</Text> : null}
			<AuthActions as={AuthView}>
				<Button
					className={`auth-primary mini-auth-button ${busy ? "is-busy" : ""}`}
					disabled={busy || expired || !code.trim() || undefined}
					loading={busy || undefined}
					onClick={() => void join()}
				>
					{t("加入内测", "Join the beta")}
				</Button>
				<Button
					className="mini-auth-link mini-auth-invite-action"
					disabled={busy || undefined}
					onClick={onSwitchAccount}
				>
					{expired ? t("重新验证身份", "Verify again") : t("切换账号", "Switch account")}
				</Button>
			</AuthActions>
		</>
	);
}
