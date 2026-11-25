import { Button, CodeField, Field, TextInput } from "@yonder/ui-components";
import { useAccountTimeZone, useMe, usePhoneChange } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Translate } from "./account-failure.ts";
import { describeAccountFailure } from "./account-failure.ts";

export interface ChangePhoneFormProps {
	onDone: () => void;
}

/**
 * Changing the sign-in phone number takes two proofs: a code sent to the number the account has now
 * and a code sent to the new one. The number is typed in full with the country code (+86…), like
 * everywhere else a number is typed.
 */
export function ChangePhoneForm({ onDone }: ChangePhoneFormProps) {
	const { t, i18n } = useTranslation();
	const zone = useAccountTimeZone();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const me = useMe();
	const { sendCode, change } = usePhoneChange();
	const sms = me.data?.signInMethods.find((method) => method.channel === "sms");
	const currentLabel = t("me.phoneChange.currentCode", { masked: sms?.channel === "sms" ? sms.masked : "" });
	const [currentSent, setCurrentSent] = useState<string | null>(null);
	const [newSent, setNewSent] = useState<string | null>(null);
	const [newTarget, setNewTarget] = useState("+86");
	const [currentCode, setCurrentCode] = useState("");
	const [newCode, setNewCode] = useState("");
	const [error, setError] = useState<{ text: string; field?: string } | null>(null);
	const fail = (failure: unknown) =>
		setError(describeAccountFailure(failure, t as unknown as Translate, { locale, zone }));

	return (
		<form
			className="flex w-full max-w-[400px] flex-col gap-[var(--spacing-6)]"
			onSubmit={(event) => {
				event.preventDefault();
				setError(null);
				if (!currentSent) {
					setError({ text: t("me.phoneChange.needCurrent") });
					return;
				}
				change.mutate(
					{ currentCode, newTarget: newTarget.replace(/\s/g, ""), newCode },
					{ onSuccess: onDone, onError: fail },
				);
			}}
		>
			<p className="text-caption text-[var(--color-text-secondary)]">{t("me.phoneChange.intro")}</p>

			<div className="flex flex-col gap-[var(--spacing-3)]">
				<Button
					type="button"
					variant="secondary"
					loading={sendCode.isPending && sendCode.variables === undefined}
					onClick={() => {
						setError(null);
						sendCode.mutate(undefined, {
							onSuccess: (response) => setCurrentSent(response.maskedTarget),
							onError: fail,
						});
					}}
				>
					{t("me.phoneChange.sendCurrent")}
				</Button>
				{currentSent ? (
					<p className="text-caption text-[var(--color-text-tertiary)]">
						{t("me.phoneChange.sentTo", { masked: currentSent })}
					</p>
				) : null}
				<Field label={currentLabel} htmlFor="current-phone-code">
					<CodeField id="current-phone-code" label={currentLabel} value={currentCode} onChange={setCurrentCode} />
				</Field>
			</div>

			<div className="flex flex-col gap-[var(--spacing-3)]">
				<Field
					label={t("me.phoneChange.newTarget")}
					htmlFor="new-phone"
					error={error?.field === "target" ? error.text : undefined}
				>
					<TextInput
						id="new-phone"
						value={newTarget}
						onChange={(event) => setNewTarget(event.target.value)}
						inputMode="tel"
						autoComplete="tel"
						invalid={error?.field === "target"}
					/>
				</Field>
				<Button
					type="button"
					variant="secondary"
					loading={sendCode.isPending && sendCode.variables !== undefined}
					onClick={() => {
						setError(null);
						sendCode.mutate(newTarget.replace(/\s/g, ""), {
							onSuccess: (response) => setNewSent(response.maskedTarget),
							onError: fail,
						});
					}}
				>
					{t("me.phoneChange.sendNew")}
				</Button>
				{newSent ? (
					<p className="text-caption text-[var(--color-text-tertiary)]">
						{t("me.phoneChange.sentTo", { masked: newSent })}
					</p>
				) : null}
				<Field label={t("me.phoneChange.newCode")} htmlFor="new-phone-code">
					<CodeField id="new-phone-code" label={t("me.phoneChange.newCode")} value={newCode} onChange={setNewCode} />
				</Field>
			</div>

			{error && !error.field ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{error.text}
				</p>
			) : null}
			<Button
				type="submit"
				loading={change.isPending}
				disabled={currentCode.length !== 6 || newCode.length !== 6 || newTarget.length < 8}
			>
				{t("me.phoneChange.submit")}
			</Button>
		</form>
	);
}
