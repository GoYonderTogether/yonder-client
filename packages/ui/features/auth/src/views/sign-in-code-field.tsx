import { Button, CodeField, Field } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";
import type { FailureMessage } from "../hooks/describe-failure.ts";

interface SignInCodeFieldProps {
	code: string;
	onChange: (code: string) => void;
	onSubmit: (code: string) => Promise<void>;
	onResend: () => Promise<void>;
	secondsLeft: number;
	sending: boolean;
	submitting: boolean;
	failure: FailureMessage | null;
}

export function SignInCodeField({
	code,
	onChange,
	onSubmit,
	onResend,
	secondsLeft,
	sending,
	submitting,
	failure,
}: SignInCodeFieldProps) {
	const { t } = useTranslation();
	return (
		<Field
			label={t("auth.codeLabel")}
			htmlFor="sign-in-code"
			error={failure?.field === "code" ? failure.text : undefined}
			action={
				<Button variant="link" size="sm" onClick={() => void onResend()} disabled={secondsLeft > 0 || sending}>
					{secondsLeft > 0 ? t("auth.resendIn", { seconds: secondsLeft }) : t("auth.resendCode")}
				</Button>
			}
		>
			<CodeField
				id="sign-in-code"
				label={t("auth.codeLabel")}
				value={code}
				onChange={onChange}
				onComplete={(complete) => void onSubmit(complete)}
				disabled={submitting}
				invalid={failure?.field === "code"}
				describedBy={failure?.field === "code" ? "sign-in-code-hint" : undefined}
				autoFocus
			/>
		</Field>
	);
}
