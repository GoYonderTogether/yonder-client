import { getLegalDocument } from "@yonder/feature-legal";
import { IconButton } from "@yonder/ui-components";
import { resolveLocale } from "@yonder/ui-i18n";
import { ChevronLeft } from "lucide-react";
import Markdown from "markdown-to-jsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { isMacDesktopShell } from "../lib/platform.ts";

export function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const legalDocument = getLegalDocument(kind, resolveLocale(i18n.resolvedLanguage ?? i18n.language));
	const back = () => {
		if (window.history.state?.idx > 0 || (document.referrer && window.history.length > 1)) navigate(-1);
		else navigate("/", { replace: true });
	};
	return (
		<main className="min-h-dvh bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
			<header
				className={`sticky top-0 z-10 bg-[var(--color-bg-base)] ${isMacDesktopShell() ? "pt-[var(--spacing-10)]" : "pt-[env(safe-area-inset-top)]"}`}
			>
				<div className="mx-auto w-full max-w-3xl px-[var(--spacing-6)] py-[var(--spacing-2)]">
					<IconButton aria-label={t("app.back")} onClick={back} autoFocus>
						<ChevronLeft size={24} strokeWidth={1.8} aria-hidden="true" />
					</IconButton>
				</div>
			</header>
			<article className="mx-auto w-full max-w-3xl px-[var(--spacing-6)] pb-[max(var(--spacing-12),env(safe-area-inset-bottom))]">
				<h1 className="mt-[var(--spacing-4)] text-h1 font-normal">{legalDocument.title}</h1>
				<p className="mt-[var(--spacing-3)] text-caption text-[var(--color-text-secondary)]">
					{t("legal.version", { version: legalDocument.version })} ·{" "}
					{t("legal.effectiveDate", { date: legalDocument.effectiveDate })}
				</p>
				<div className="mt-[var(--spacing-8)] flex flex-col gap-[var(--spacing-4)]">
					{legalDocument.intro.map((paragraph) => (
						<Paragraph key={paragraph} text={paragraph} />
					))}
				</div>
				{legalDocument.sections.map((section) => (
					<section key={section.heading} className="mt-[var(--spacing-8)]">
						<h2 className="mb-[var(--spacing-4)] text-h2 font-normal">{section.heading}</h2>
						<div className="flex flex-col gap-[var(--spacing-4)]">
							{section.paragraphs.map((paragraph) => (
								<Paragraph key={paragraph} text={paragraph} />
							))}
						</div>
					</section>
				))}
			</article>
		</main>
	);
}

function Paragraph({ text }: { text: string }) {
	return (
		<p>
			<Markdown options={{ forceInline: true, disableParsingRawHTML: true }}>{text}</Markdown>
		</p>
	);
}
