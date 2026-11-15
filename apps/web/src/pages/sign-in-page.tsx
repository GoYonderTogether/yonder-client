import { AuthLayout, ForgotPasswordForm, SignInForm } from "@yonder/feature-auth";
import { useData } from "@yonder/ui-data";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { BUILD_VERSION } from "../lib/config.ts";

/**
 * `/sign-in`. One page for signing in and for creating an account: the server decides which it was
 * and says so with `isNewAccount`, and only a new account sees the two optional setup steps.
 */
export function SignInPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const [params] = useSearchParams();
	const { startSession } = useData();
	const [forgot, setForgot] = useState(false);
	const legalTrigger = useRef<HTMLAnchorElement | null>(null);

	useEffect(() => {
		// The form is still hidden until React commits the route change, so wait for it to show.
		const focusWhenVisible = (framesLeft: number) => {
			const trigger = legalTrigger.current;
			if (trigger && !trigger.closest("[hidden]")) trigger.focus();
			else if (framesLeft > 0) requestAnimationFrame(() => focusWhenVisible(framesLeft - 1));
		};
		const restoreFocus = () => {
			if (window.location.pathname !== location.pathname) return;
			requestAnimationFrame(() => focusWhenVisible(30));
		};
		window.addEventListener("popstate", restoreFocus);
		return () => window.removeEventListener("popstate", restoreFocus);
	}, [location.pathname]);

	const next = params.get("next");

	const onSignedIn = useCallback(
		async (result: { isNewAccount: boolean; accessToken: string; refreshToken?: string }) => {
			// The previous account's cache must not be visible for a moment under the new one.
			await startSession(result);
			if (result.isNewAccount) navigate("/setup/password", { replace: true });
			else navigate(next?.startsWith("/") ? next : "/messages", { replace: true });
		},
		[navigate, next, startSession],
	);

	return (
		<AuthLayout>
			{forgot ? (
				<ForgotPasswordForm
					onCancel={() => setForgot(false)}
					onDone={() => {
						setForgot(false);
						navigate("/sign-in", { replace: true });
					}}
				/>
			) : (
				<>
					<SignInForm
						onOpenLegal={(document, trigger) => {
							legalTrigger.current = trigger;
							navigate(`/${document}`, { state: { backgroundLocation: location } });
						}}
						device={{ name: deviceName(), platform: "web", appVersion: BUILD_VERSION }}
						onSignedIn={(result) => void onSignedIn(result)}
					/>
					<button
						type="button"
						onClick={() => setForgot(true)}
						className="mt-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)] underline underline-offset-2"
					>
						{t("auth.forgotPassword")}
					</button>
				</>
			)}
		</AuthLayout>
	);
}

/** A name a person can recognise in the sessions list, without asking permission for anything. */
function deviceName(): string {
	const platform = typeof navigator === "undefined" ? "" : navigator.userAgent;
	if (/iPhone|iPad/i.test(platform)) return "iPhone";
	if (/Android/i.test(platform)) return "Android";
	if (/Macintosh/i.test(platform)) return "Mac";
	if (/Windows/i.test(platform)) return "Windows PC";
	return "Web browser";
}
