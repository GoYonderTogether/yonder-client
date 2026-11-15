import { Button, Logo } from "@yonder/ui-components";
import { useLocalePreference } from "@yonder/ui-data";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * The sign-in and setup screens share one frame: a single centred column, no panes, no tabs
 * (11 第七节: before signing in there is only a centred column). It also carries the product mark.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
	const { locale, setLocale } = useLocalePreference();
	const { t } = useTranslation();
	return (
		<main className="flex min-h-dvh w-full flex-col items-center justify-center bg-[var(--color-bg-base)] px-[var(--spacing-6)] pt-[max(var(--spacing-10),calc(env(safe-area-inset-top)+var(--control-sm)+var(--spacing-6)))] pb-[max(var(--spacing-10),env(safe-area-inset-bottom))]">
			<div className="absolute top-[max(var(--spacing-4),env(safe-area-inset-top))] right-[max(var(--spacing-4),env(safe-area-inset-right))]">
				<Button
					variant="ghost"
					size="sm"
					lang={locale === "zh-CN" ? "en" : "zh-CN"}
					onClick={() => setLocale(locale === "zh-CN" ? "en" : "zh-CN")}
				>
					{locale === "zh-CN" ? t("common.locale.en") : t("common.locale.zhCN")}
				</Button>
			</div>
			{/* The mark sits on the form's left edge, so the brand, the title and every field share one line. */}
			<div className="flex w-full max-w-[400px] flex-col">
				<div className="mb-[var(--spacing-6)] flex items-center gap-[var(--spacing-2)] text-[var(--color-text-primary)]">
					<Logo size={28} fit="text" />
					<span className="text-h3 font-semibold">Yonder</span>
				</div>
				{children}
			</div>
		</main>
	);
}
