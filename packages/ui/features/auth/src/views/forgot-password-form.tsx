import { Button, CodeField, Field, PasswordField, PhoneField } from "@yonder/ui-components";
import { useApi } from "@yonder/ui-data";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FailureMessage, Translate } from "../hooks/describe-failure.ts";
import { describeFailure } from "../hooks/describe-failure.ts";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, isValidE164, toE164 } from "../hooks/phone.ts";

export interface ForgotPasswordFormProps {
	onDone: () => void;
	onCancel: () => void;
}

/**
 * Forgot password: prove the phone with a code, then set a new one. Same proof as signing in, so
 * there is no second notion of identity (11 第七节第 5 条).
 */
export function ForgotPasswordForm({ onDone, onCancel }: ForgotPasswordFormProps) {
	const { t } = useTranslation();
	const api = useApi();

	const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
	const [phoneInput, setPhoneInput] = useState("");
	const [stage, setStage] = useState<"phone" | "reset">("phone");
	const [code, setCode] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [maskedTarget, setMaskedTarget] = useState("");
	const [sending, setSending] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [failure, setFailure] = useState<FailureMessage | null>(null);

	const target = toE164(countryCode, phoneInput);

	const sendCode = useCallback(async () => {
		setFailure(null);
		if (!isValidE164(target)) {
			setFailure({ text: t("auth.errors.invalidPhone"), field: "target" });
			return;
		}
		setSending(true);
		try {
			const response = await api.sendCode({ channel: "sms", target, purpose: "reset_password" });
			setMaskedTarget(response.maskedTarget);
			setStage("reset");
		} catch (error) {
			setFailure(describeFailure(error, t as unknown as Translate));
		} finally {
			setSending(false);
		}
	}, [api, t, target]);

	const submit = useCallback(async () => {
		setFailure(null);
		if ([...newPassword].length < 8) {
			setFailure({ text: t("auth.errors.passwordTooShort"), field: "newPassword" });
			return;
		}
		setSubmitting(true);
		try {
			// The code proves the number; the password endpoint then sets the new one and signs every
			// other device out.
			await api.resetPasswordWithCode({ channel: "sms", target, code, newPassword });
			onDone();
		} catch (error) {
			setFailure(describeFailure(error, t as unknown as Translate));
		} finally {
			setSubmitting(false);
		}
	}, [api, code, newPassword, onDone, t, target]);

	return (
		<form
			className="flex w-full max-w-[400px] flex-col gap-[var(--spacing-6)]"
			onSubmit={(event) => {
				event.preventDefault();
				if (stage === "phone") void sendCode();
				else void submit();
			}}
		>
			<h1 className="text-h1 text-[var(--color-text-primary)]">{t("auth.forgotPassword")}</h1>

			<Field
				label={t("auth.phoneLabel")}
				htmlFor="reset-phone"
				error={failure?.field === "target" ? failure.text : undefined}
			>
				<PhoneField
					id="reset-phone"
					type="tel"
					inputMode="tel"
					autoComplete="tel-national"
					value={stage === "phone" ? phoneInput : maskedTarget}
					onChange={(event) => setPhoneInput(event.target.value)}
					countryCode={countryCode}
					onCountryCodeChange={setCountryCode}
					countryLabel={t("auth.countryLabel")}
					countries={COUNTRY_CODES.map(({ code: country }) => ({
						code: country,
						label: `${t(`auth.countries.${country}`)} ${country}`,
					}))}
					fieldSize="lg"
					disabled={stage === "reset"}
					invalid={failure?.field === "target"}
					aria-describedby={failure?.field === "target" ? "reset-phone-hint" : undefined}
				/>
			</Field>

			{stage === "reset" ? (
				<>
					<Field
						label={t("auth.codeLabel")}
						htmlFor="reset-code"
						error={failure?.field === "code" ? failure.text : undefined}
					>
						<CodeField
							id="reset-code"
							label={t("auth.codeLabel")}
							value={code}
							onChange={setCode}
							invalid={failure?.field === "code"}
							describedBy={failure?.field === "code" ? "reset-code-hint" : undefined}
							autoFocus
						/>
					</Field>
					<Field
						label={t("auth.newPasswordLabel")}
						htmlFor="reset-password"
						hint={`${t("auth.passwordHint")} ${t("auth.changePasswordBody")}`}
						error={failure?.field === "newPassword" ? failure.text : undefined}
					>
						<PasswordField
							id="reset-password"
							showLabel={t("auth.showPassword")}
							hideLabel={t("auth.hidePassword")}
							fieldSize="lg"
							autoComplete="new-password"
							value={newPassword}
							onChange={(event) => setNewPassword(event.target.value)}
							invalid={failure?.field === "newPassword"}
							aria-describedby="reset-password-hint"
						/>
					</Field>
				</>
			) : null}

			{failure && !failure.field ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{failure.text}
				</p>
			) : null}

			<div className="flex gap-[var(--spacing-2)]">
				<Button type="button" variant="ghost" size="lg" onClick={onCancel}>
					{t("app.cancel")}
				</Button>
				<Button type="submit" variant="primary" size="lg" block loading={sending || submitting}>
					{stage === "phone" ? t("auth.sendCode") : t("auth.changePasswordTitle")}
				</Button>
			</div>
		</form>
	);
}
