import { useSessionStore } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";

/**
 * Shown while the first refresh decides whether a session exists. Neutral on purpose: neither the
 * app nor the sign-in screen, so a returning user sees no flash of either.
 */
export function Splash() {
	const reconnecting = useSessionStore((state) => state.status === "reconnecting");
	const { t } = useTranslation();
	const label = reconnecting ? t("chat.reconnecting") : "loading";
	return (
		<div className="flex min-h-dvh flex-col items-center justify-center gap-[var(--spacing-3)] bg-[var(--color-bg-base)]">
			<span
				role="status"
				aria-label={label}
				className="size-6 animate-spin rounded-full border-2 border-[var(--color-border-default)] border-t-[var(--color-accent)]"
			/>
			{reconnecting ? (
				<p aria-hidden="true" className="text-caption text-[var(--color-text-secondary)]">
					{label}
				</p>
			) : null}
		</div>
	);
}
