import { Checkbox } from "@yonder/ui-components";
import type { MouseEvent, Ref } from "react";
import { useTranslation } from "react-i18next";

interface TermsConsentProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	onOpenLegal: (document: "terms" | "privacy", trigger: HTMLAnchorElement) => void;
	ref: Ref<HTMLInputElement>;
}

export function TermsConsent({ checked, onChange, onOpenLegal, ref }: TermsConsentProps) {
	const { t } = useTranslation();
	function open(event: MouseEvent<HTMLAnchorElement>, document: "terms" | "privacy") {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		onOpenLegal(document, event.currentTarget);
	}
	const linkClass = "text-[var(--color-accent-text)] underline underline-offset-2";
	return (
		<div className="flex items-start gap-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">
			<Checkbox
				id="sign-in-consent"
				ref={ref}
				checked={checked}
				aria-labelledby="sign-in-consent-label"
				className="relative shrink-0 [&_input]:relative [&_input]:z-10 [&_svg]:z-20 after:absolute after:top-1/2 after:left-1/2 after:size-[calc(var(--control-sm)+var(--spacing-3))] after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
				onChange={(event) => onChange(event.target.checked)}
			/>
			<span id="sign-in-consent-label" className="relative">
				<label htmlFor="sign-in-consent">{t("auth.termsPrefix")}</label>
				<a href="/terms" className={linkClass} onClick={(event) => open(event, "terms")}>
					{t("me.about.terms")}
				</a>
				<label htmlFor="sign-in-consent">{t("auth.termsBetween")}</label>
				<a href="/privacy" className={linkClass} onClick={(event) => open(event, "privacy")}>
					{t("me.about.privacy")}
				</a>
				<label htmlFor="sign-in-consent">{t("auth.termsSuffix")}</label>
			</span>
		</div>
	);
}
