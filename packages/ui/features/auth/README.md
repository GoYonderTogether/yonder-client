# @yonder/feature-auth

Signing in, setting a password, and the optional profile step.

## What it does

| screen               | when                                                                |
| -------------------- | ------------------------------------------------------------------- |
| `SignInForm`         | phone → code, or phone → password; a new number creates the account |
| `PasswordSetupForm`  | the optional "set a password" step, and 「我」→ change password     |
| `ProfileSetupForm`   | the optional name and avatar step                                   |
| `ForgotPasswordForm` | code → new password; every other session is signed out after        |

## What it does not do

- It does not decide where to go after signing in. It calls `onSignedIn({ isNewAccount })` and the
  app routes: new account → password step → profile step → chat; existing account → chat.
- It does not keep session state. The token store and the query cache are `@yonder/ui-data`.
- It does not normalise the phone for the server beyond `toE164`; the server checks again.

## Details worth knowing

- **One page, two ways in.** There is no registration form: the code endpoint and the sign-in
  endpoint are the same call for a new and an existing number, and `isNewAccount` says which it was.
- **The code field is one input** that looks like six boxes, so paste and `autocomplete="one-time-code"`
  work.
- **The resend countdown comes from the server's `retryAfter`**, not from a local guess, so a reload
  cannot give a free resend.
- **Errors are mapped once** in `hooks/describe-failure.ts`; the same failure reads the same way on
  every screen.

## Rules

- Text comes from `t()`; no literals.
- It may import tokens, i18n, components, shell and data — never another feature.
