import { Button, CodeField, Field, TextInput } from "@yonder/ui-components";
import { useDeleteAccount, useMe } from "@yonder/ui-data";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Translate } from "./account-failure.ts";
import { describeAccountFailure } from "./account-failure.ts";

/** How long the final button stays disabled, so the person has to read what it will do. */
export const DELETE_COUNTDOWN_SECONDS = 3;

export interface DeleteAccountFlowProps {
	onCancel: () => void;
}

/**
 * Deleting the account takes three things in order: a code sent to the account's own number, the
 * handle typed back, and a final button that stays disabled for three seconds after the first two
 * are right. The countdown starts only when the button could otherwise be pressed, so it is the
 * last thing between the person and the request, not a delay before they have read anything.
 */
export function DeleteAccountFlow({ onCancel }: DeleteAccountFlowProps) {
	const { t } = useTranslation();
	const me = useMe();
	const { sendCode, confirm } = useDeleteAccount();
	const handle = me.data?.member.handle ?? "";
	const sms = me.data?.signInMethods.find((method) => method.channel === "sms");
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [code, setCode] = useState("");
	const [typed, setTyped] = useState("");
	const [error, setError] = useState<{ text: string; field?: string } | null>(null);
	const [secondsLeft, setSecondsLeft] = useState(DELETE_COUNTDOWN_SECONDS);
	const ready = code.length === 6 && typed.trim() === handle && handle !== "";

	// The countdown restarts whenever the inputs stop being valid, and runs once they are.
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

	const fail = (failure: unknown) => setError(describeAccountFailure(failure, t as unknown as Translate));

	return (
		<div className="flex flex-col gap-[var(--spacing-4)] rounded-[var(--radius-lg)] bg-[var(--color-bg-surface)] p-[var(--spacing-4)]">
			<p className="text-caption text-[var(--color-text-secondary)]">{t("me.account.deleteAccountBody")}</p>

			<div className="flex flex-col gap-[var(--spacing-2)]">
				<Button
					type="button"
					variant="secondary"
					loading={sendCode.isPending}
					onClick={() => {
						setError(null);
						sendCode.mutate(undefined, { onSuccess: (response) => setSentTo(response.maskedTarget), onError: fail });
					}}
				>
					{t("me.account.deleteSendCode", { masked: sms?.channel === "sms" ? sms.masked : "" })}
				</Button>
				{sentTo ? (
					<p className="text-caption text-[var(--color-text-tertiary)]">
						{t("me.phoneChange.sentTo", { masked: sentTo })}
					</p>
				) : null}
			</div>

			<Field label={t("me.account.deleteCodeLabel")} htmlFor="delete-account-code">
				<CodeField id="delete-account-code" label={t("me.account.deleteCodeLabel")} value={code} onChange={setCode} />
			</Field>

			<Field
				label={t("me.account.deleteAccountConfirmLabel", { handle })}
				htmlFor="confirm-handle"
				error={error?.field === "confirmHandle" ? error.text : undefined}
			>
				<TextInput
					id="confirm-handle"
					value={typed}
					onChange={(event) => setTyped(event.target.value)}
					autoComplete="off"
					autoCapitalize="none"
					spellCheck={false}
					invalid={error?.field === "confirmHandle"}
				/>
			</Field>

			{error && error.field !== "confirmHandle" ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{error.text}
				</p>
			) : null}

			<div className="flex gap-[var(--spacing-2)]">
				<Button type="button" variant="secondary" onClick={onCancel}>
					{t("app.cancel")}
				</Button>
				<Button
					type="button"
					variant="danger"
					loading={confirm.isPending}
					disabled={!ready || secondsLeft > 0}
					onClick={() => {
						setError(null);
						confirm.mutate({ confirmHandle: typed.trim(), code }, { onError: fail });
					}}
				>
					{ready && secondsLeft > 0
						? t("me.account.deleteAccountCountdown", { seconds: secondsLeft })
						: t("me.account.deleteAccount")}
				</Button>
			</div>
		</div>
	);
}
