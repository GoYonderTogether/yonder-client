/**
 * `@yonder/feature-auth` — signing in, setting a password, and the optional profile step.
 *
 * It owns the screens and the phone-number rules. It does not own the session: a successful
 * sign-in tells the caller, and the app decides where to go.
 */

export { CodeField as CodeInput } from "@yonder/ui-components";
export type { FailureMessage, Translate } from "./hooks/describe-failure.ts";
export { describeFailure } from "./hooks/describe-failure.ts";
export type { CountryCode } from "./hooks/phone.ts";
export { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, formatNational, isValidE164, toE164 } from "./hooks/phone.ts";
export { AuthLayout } from "./views/auth-layout.tsx";
export type { ForgotPasswordFormProps } from "./views/forgot-password-form.tsx";
export { ForgotPasswordForm } from "./views/forgot-password-form.tsx";
export type { PasswordSetupFormProps } from "./views/password-setup-form.tsx";
export { PasswordSetupForm } from "./views/password-setup-form.tsx";
export type { ProfileSetupFormProps } from "./views/profile-setup-form.tsx";
export { ProfileSetupForm } from "./views/profile-setup-form.tsx";
export type { AuthMode, SignInFormProps } from "./views/sign-in-form.tsx";
export { SignInForm } from "./views/sign-in-form.tsx";
