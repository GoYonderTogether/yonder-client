import { Button, Field, PasswordField } from "@yonder/ui-components";
import { useSetPassword } from "@yonder/ui-data";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FailureMessage, Translate } from "../hooks/describe-failure.ts";
import { describeFailure } from "../hooks/describe-failure.ts";

export interface PasswordSetupFormProps {
	/** The step after this one, or the app. */
	onDone: () => void;
	onSkip: () => void;
	/** Changing an existing password asks for the current one; setting the first does not. */
	mode?: "set" | "change";
}

/**
 * The optional password step, and the change-password screen in 「我」. One component because it is
 * one question: a new password, plus whatever proves you may set it.
 */
export function PasswordSetupForm({ onDone, onSkip, mode = "set" }: PasswordSetupFormProps) {
	const { t } = useTranslation();
	const setPassword = useSetPassword();
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [failure, setFailure] = useState<FailureMessage | null>(null);

	const submit = useCallback(async () => {
		setFailure(null);
		if ([...newPassword].length < 8) {
			setFailure({ text: t("auth.errors.passwordTooShort"), field: "newPassword" });
			return;
		}
		try {
			await setPassword.mutateAsync({
				newPassword,
				...(mode === "change" ? { currentPassword } : {}),
			});
			onDone();
		} catch (error) {
			setFailure(describeFailure(error, t as unknown as Translate));
		}
	}, [currentPassword, mode, newPassword, onDone, setPassword, t]);

	return (
		<form
			className="flex w-full max-w-[400px] flex-col gap-[var(--spacing-6)]"
			onSubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<h1 className="text-h1 text-[var(--color-text-primary)]">
				{mode === "set" ? t("auth.setupPasswordTitle") : t("auth.changePasswordTitle")}
			</h1>

			{mode === "change" ? (
				<Field
					label={t("auth.currentPasswordLabel")}
					htmlFor="current-password"
					error={failure?.field === "password" ? failure.text : undefined}
				>
					<PasswordField
						id="current-password"
						showLabel={t("auth.showPassword")}
						hideLabel={t("auth.hidePassword")}
						fieldSize="lg"
						autoComplete="current-password"
						value={currentPassword}
						onChange={(event) => setCurrentPassword(event.target.value)}
						invalid={failure?.field === "password"}
					/>
				</Field>
			) : null}

			<Field
				label={t("auth.newPasswordLabel")}
				htmlFor="new-password"
				hint={mode === "change" ? `${t("auth.passwordHint")} ${t("auth.changePasswordBody")}` : t("auth.passwordHint")}
				error={failure?.field === "newPassword" ? failure.text : undefined}
			>
				<PasswordField
					id="new-password"
					showLabel={t("auth.showPassword")}
					hideLabel={t("auth.hidePassword")}
					fieldSize="lg"
					autoComplete="new-password"
					value={newPassword}
					onChange={(event) => setNewPassword(event.target.value)}
					invalid={failure?.field === "newPassword"}
					aria-describedby="new-password-hint"
				/>
			</Field>

			{failure && !failure.field ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{failure.text}
				</p>
			) : null}

			<div className="flex flex-wrap gap-[var(--spacing-2)]">
				{mode === "set" ? (
					<Button type="button" variant="ghost" size="lg" className="shrink-0 whitespace-nowrap" onClick={onSkip}>
						{t("app.skipStep")}
					</Button>
				) : null}
				<Button
					type="submit"
					variant="primary"
					size="lg"
					className="flex-1 whitespace-nowrap"
					loading={setPassword.isPending}
				>
					{mode === "set" ? t("app.continue") : t("app.save")}
				</Button>
			</div>
		</form>
	);
}
