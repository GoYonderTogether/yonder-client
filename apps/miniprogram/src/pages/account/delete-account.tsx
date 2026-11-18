import { View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { Button, Field } from "../../components/ui";
import { t } from "../../lib/i18n";

/** How long the final button stays disabled, so the person has to read what it will do. */
export const DELETE_COUNTDOWN_SECONDS = 3;

export interface DeleteAccountProps {
	handle: string;
	/** Sends a code to the account's own number; resolves with its masked form. */
	sendCode: () => Promise<string>;
	/** Starts the 7-day wait. Rejects with the server's real reason. */
	confirm: (input: { confirmHandle: string; code: string }) => Promise<void>;
	/** Shows a failure; the page decides how (a toast). */
	onError: (error: unknown) => void;
}

/**
 * Deleting the account: a code to the account's own number, the handle typed back, then a final
 * button that stays disabled for three seconds once both are right. The wait is 7 days and nothing
 * is erased, which the text says before the person presses anything.
 */
export function DeleteAccount({ handle, sendCode, confirm, onError }: DeleteAccountProps) {
	const [sentTo, setSentTo] = useState("");
	const [code, setCode] = useState("");
	const [typed, setTyped] = useState("");
	const [sending, setSending] = useState(false);
	const [busy, setBusy] = useState(false);
	const [secondsLeft, setSecondsLeft] = useState(DELETE_COUNTDOWN_SECONDS);
	const ready = code.length === 6 && handle !== "" && typed.trim() === handle;

	useEffect(() => {
		if (!ready) {
			setSecondsLeft(DELETE_COUNTDOWN_SECONDS);
			return;
		}
		const startedAt = Date.now();
		const tick = () =>
			setSecondsLeft(Math.max(0, DELETE_COUNTDOWN_SECONDS - Math.floor((Date.now() - startedAt) / 1000)));
		tick();
		const timer = setInterval(tick, 250);
		return () => clearInterval(timer);
	}, [ready]);

	return (
		<View className="mini-card">
			<View>
				{t(
					"注销后账号保留 7 天，期间再登录一次就会取消。7 天后账号不能再登录，别人搜不到你，主页看不到，定时任务和后台任务全部停止。",
					"Your account is kept for 7 days, and signing in again during that time cancels it. After 7 days it can no longer sign in, nobody can find you, your profile is hidden, and every scheduled and background task stops.",
				)}
			</View>
			<Button
				secondary
				loading={sending}
				onClick={() => {
					setSending(true);
					sendCode()
						.then(setSentTo)
						.catch(onError)
						.finally(() => setSending(false));
				}}
			>
				{t("给你的手机号发验证码", "Send a code to your phone number")}
			</Button>
			{sentTo ? <View>{t(`已发送到 ${sentTo}`, `Sent to ${sentTo}`)}</View> : null}
			<Field label={t("验证码", "Code")} value={code} onInput={setCode} type="number" />
			<Field
				label={t("输入你的 Yonder 号确认注销", "Enter your Yonder handle to delete account")}
				value={typed}
				onInput={setTyped}
			/>
			<Button
				danger
				loading={busy}
				disabled={!ready || secondsLeft > 0}
				onClick={() => {
					setBusy(true);
					confirm({ confirmHandle: typed.trim(), code })
						.catch(onError)
						.finally(() => setBusy(false));
				}}
			>
				{ready && secondsLeft > 0
					? t(`确认注销（${secondsLeft}）`, `Delete account (${secondsLeft})`)
					: t("确认注销", "Delete account")}
			</Button>
		</View>
	);
}
