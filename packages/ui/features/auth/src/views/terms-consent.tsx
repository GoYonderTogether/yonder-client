import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

interface TermsConsentProps {
	onOpenLegal: (document: "terms" | "privacy", trigger: HTMLAnchorElement) => void;
}

export function TermsConsent({ onOpenLegal }: TermsConsentProps) {
	const { t } = useTranslation();
	function open(event: MouseEvent<HTMLAnchorElement>, document: "terms" | "privacy") {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		onOpenLegal(document, event.currentTarget);
	}
	const linkClass = "text-[var(--color-accent-text)] underline underline-offset-2";
	return (
		<p>
			{t("auth.termsPrefix")}
			<a href="/terms" className={linkClass} onClick={(event) => open(event, "terms")}>
				{t("me.about.terms")}
			</a>
			{t("auth.termsBetween")}
			<a href="/privacy" className={linkClass} onClick={(event) => open(event, "privacy")}>
				{t("me.about.privacy")}
			</a>
			{t("auth.termsSuffix")}
		</p>
	);
}
