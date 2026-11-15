import { AuthFrame } from "@yonder/auth-presentation";
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
		<main>
			<AuthFrame
				as="div"
				locale={
					<Button
						variant="ghost"
						size="sm"
						lang={locale === "zh-CN" ? "en" : "zh-CN"}
						onClick={() => setLocale(locale === "zh-CN" ? "en" : "zh-CN")}
					>
						{locale === "zh-CN" ? t("common.locale.en") : t("common.locale.zhCN")}
					</Button>
				}
				brand={
					<>
						<Logo size={28} fit="text" />
						<span>Yonder</span>
					</>
				}
			>
				{children}
			</AuthFrame>
		</main>
	);
}
