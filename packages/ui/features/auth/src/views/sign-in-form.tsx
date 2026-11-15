import { Button, cn, Field, IconButton, PasswordField, PhoneField } from "@yonder/ui-components";
import { clearInvite, readInvite, useApi, useData, useResolvedInvite } from "@yonder/ui-data";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FailureMessage, Translate } from "../hooks/describe-failure.ts";
import { describeFailure } from "../hooks/describe-failure.ts";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, formatNational, isValidE164, toE164 } from "../hooks/phone.ts";
import { SignInCodeField } from "./sign-in-code-field.tsx";
import { TermsConsent } from "./terms-consent.tsx";

export type AuthMode = "code" | "password";

export interface SignInFormProps {
	/** Called after a successful sign-in. `isNewAccount` decides which setup steps follow. */
	onSignedIn: (result: { isNewAccount: boolean; accessToken: string; refreshToken?: string }) => void;
	/** The device description sent with the sign-in, for the sessions list. */
	device: { name: string; platform: "web" | "macos" | "windows" | "ios" | "android" | "linux"; appVersion: string };
	initialMode?: AuthMode;
	onOpenLegal: (document: "terms" | "privacy", trigger: HTMLAnchorElement) => void;
}

/**
 * The sign-in screen: one page, two ways in. There is no separate registration form — a new number
 * creates the account as it signs in (11 第七节).
 */
export function SignInForm({ onSignedIn, device, onOpenLegal, initialMode = "code" }: SignInFormProps) {
	const { t } = useTranslation();
	const api = useApi();
	const { storage } = useData();
	const [inviteCode, setInviteCode] = useState(() => readInvite(storage));
	const invite = useResolvedInvite(inviteCode);

	const [mode, setMode] = useState<AuthMode>(initialMode);
	const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
	const [phoneInput, setPhoneInput] = useState("");
	const [code, setCode] = useState("");
	const [password, setPassword] = useState("");
	const [acceptedTerms, setAcceptedTerms] = useState(false);
	const [stage, setStage] = useState<"phone" | "code">("phone");
	const [sending, setSending] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [failure, setFailure] = useState<FailureMessage | null>(null);
	const [maskedTarget, setMaskedTarget] = useState("");
	const [retryAt, setRetryAt] = useState<number | null>(null);
	const [secondsLeft, setSecondsLeft] = useState(0);
	const termsRef = useRef<HTMLInputElement>(null);

	const target = toE164(countryCode, phoneInput);
	const phoneValid = isValidE164(target);

	// One countdown, driven by the timestamp the server answered with rather than a local guess.
	useEffect(() => {
		if (retryAt === null) return;
		const tick = () => {
			const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
			setSecondsLeft(remaining);
			if (remaining === 0) setRetryAt(null);
		};
		tick();
		const timer = setInterval(tick, 1000);
		return () => clearInterval(timer);
	}, [retryAt]);

	const sendCode = useCallback(async () => {
		setFailure(null);
		if (!phoneValid) {
			setFailure({ text: t("auth.errors.invalidPhone"), field: "target" });
			return;
		}
		setSending(true);
		try {
			const response = await api.sendCode({ channel: "sms", target, purpose: "sign_in" });
			setMaskedTarget(response.maskedTarget);
			setRetryAt(Date.now() + response.retryAfter * 1000);
			setStage("code");
		} catch (error) {
			setFailure(describeFailure(error, t as unknown as Translate));
		} finally {
			setSending(false);
		}
	}, [api, phoneValid, t, target]);

	const requireTerms = useCallback(() => {
		if (acceptedTerms) return true;
		setFailure({ text: t("auth.termsRequired") });
		termsRef.current?.focus();
		return false;
	}, [acceptedTerms, t]);

	const submit = useCallback(
		async (submittedCode?: string) => {
			setFailure(null);
			if (!requireTerms()) return;
			setSubmitting(true);
			try {
				const storedInvite = readInvite(storage);
				const result = await api.signIn({
					channel: "sms",
					target,
					code: submittedCode ?? code,
					...(storedInvite ? { inviteCode: storedInvite } : {}),
					agreeTerms: true,
					device,
				});
				clearInvite(storage);
				onSignedIn(result);
			} catch (error) {
				const described = describeFailure(error, t as unknown as Translate);
				setFailure(described);
				// Only a rejected code is worth clearing; anything else leaves the digits in place.
				if (described.field === "code") setCode("");
			} finally {
				setSubmitting(false);
			}
		},
		[api, code, device, onSignedIn, requireTerms, storage, t, target],
	);

	const submitPassword = useCallback(async () => {
		setFailure(null);
		if (!requireTerms()) return;
		setSubmitting(true);
		try {
			const result = await api.signInWithPassword({ target, password, device });
			clearInvite(storage);
			onSignedIn(result);
		} catch (error) {
			setFailure(describeFailure(error, t as unknown as Translate));
		} finally {
			setSubmitting(false);
		}
	}, [api, device, onSignedIn, password, requireTerms, storage, t, target]);

	return (
		<form
			className={cn(
				"flex w-full max-w-[400px] flex-col gap-[var(--spacing-6)]",
				"[&+button]:w-full [&+button]:max-w-[400px] [&+button]:text-left",
				mode === "code" && "[&+button]:hidden",
			)}
			onSubmit={(event) => {
				event.preventDefault();
				if (mode === "password") void submitPassword();
				else if (stage === "phone") void sendCode();
				else void submit();
			}}
		>
			<h1 className="text-h1 text-[var(--color-text-primary)]">{t("auth.signInTitle")}</h1>

			<Field
				label={t("auth.phoneLabel")}
				htmlFor="sign-in-phone"
				error={failure?.field === "target" ? failure.text : undefined}
			>
				<PhoneField
					id="sign-in-phone"
					type="tel"
					inputMode="tel"
					autoComplete="tel-national"
					value={stage === "phone" ? formatNational(phoneInput) : maskedTarget}
					onChange={(event) => setPhoneInput(event.target.value)}
					countryCode={countryCode}
					onCountryCodeChange={setCountryCode}
					countryLabel={t("auth.countryLabel")}
					countries={COUNTRY_CODES.map(({ code: country }) => ({
						code: country,
						label: `${t(`auth.countries.${country}`)} ${country}`,
					}))}
					fieldSize="lg"
					disabled={stage === "code"}
					invalid={failure?.field === "target"}
					aria-describedby={failure?.field === "target" ? "sign-in-phone-hint" : undefined}
				/>
			</Field>

			{mode === "password" ? (
				<Field
					label={t("auth.passwordLabel")}
					htmlFor="sign-in-password"
					error={failure?.field === "password" ? failure.text : undefined}
				>
					<PasswordField
						id="sign-in-password"
						showLabel={t("auth.showPassword")}
						hideLabel={t("auth.hidePassword")}
						fieldSize="lg"
						autoComplete="current-password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						invalid={failure?.field === "password"}
					/>
				</Field>
			) : stage === "code" ? (
				<SignInCodeField
					code={code}
					onChange={setCode}
					onSubmit={submit}
					onResend={sendCode}
					secondsLeft={secondsLeft}
					sending={sending}
					submitting={submitting}
					failure={failure}
				/>
			) : null}

			{failure && !failure.field ? (
				<p
					role="alert"
					className="rounded-[var(--radius-sm)] bg-[var(--color-bg-subtle)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-caption text-[var(--color-danger)]"
				>
					{failure.text}
				</p>
			) : null}

			<TermsConsent ref={termsRef} checked={acceptedTerms} onChange={setAcceptedTerms} onOpenLegal={onOpenLegal} />

			<div className="flex flex-col gap-[var(--spacing-2)]">
				{inviteCode && invite.data?.valid && invite.data.inviter ? (
					<div className="flex items-center justify-between text-caption text-[var(--color-text-secondary)]">
						<span>{t("auth.invitedBy", { name: invite.data.inviter.displayName })}</span>
						<IconButton
							size="sm"
							aria-label={t("auth.removeInvite")}
							onClick={() => {
								clearInvite(storage);
								setInviteCode(null);
							}}
						>
							<X size={16} aria-hidden="true" />
						</IconButton>
					</div>
				) : null}
				{mode === "password" ? (
					<Button type="submit" variant="primary" size="lg" block loading={submitting}>
						{t("auth.submitCode")}
					</Button>
				) : stage === "phone" ? (
					<Button type="button" variant="primary" size="lg" block loading={sending} onClick={() => void sendCode()}>
						{sending ? t("auth.sendingCode") : t("auth.sendCode")}
					</Button>
				) : (
					<Button type="submit" variant="primary" size="lg" block loading={submitting} disabled={code.length !== 6}>
						{submitting ? t("auth.submitting") : t("auth.submitCode")}
					</Button>
				)}
			</div>
			<Button
				variant="link"
				className="self-start"
				onClick={() => {
					setMode(mode === "code" ? "password" : "code");
					setFailure(null);
					setStage("phone");
				}}
			>
				{mode === "code" ? t("auth.usePassword") : t("auth.useCode")}
			</Button>
		</form>
	);
}
