import { Button, Checkbox, Segmented } from "@yonder/ui-components";
import { useLocalePreference } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ButtonPreviews } from "./button-previews.tsx";
import { FieldPreviews } from "./field-previews.tsx";
import { NoticePreviews } from "./notice-previews.tsx";
import "./preview-states.css";
import { ReplyPreviews } from "./reply-previews.tsx";
import { TokenPreviews } from "./token-previews.tsx";

export default function ComponentsPage() {
	const { t } = useTranslation();
	const { locale, setLocale } = useLocalePreference();
	const [theme, setTheme] = useState<"light" | "dark">(() =>
		document.documentElement.dataset.theme === "dark" ? "dark" : "light",
	);
	const [width, setWidth] = useState("desktop");
	const [grid, setGrid] = useState(false);
	return (
		<main
			data-theme={theme}
			className="component-preview min-h-dvh bg-[var(--color-bg-base)] p-[var(--spacing-4)] text-[var(--color-text-primary)]"
		>
			<header className="mx-auto mb-[var(--spacing-6)] flex max-w-[1400px] flex-wrap items-center gap-[var(--spacing-4)]">
				<h1 className="mr-auto text-h1 font-semibold">{t("dev.title")}</h1>
				<Button variant="link" onClick={() => window.dispatchEvent(new Event("yonder:open-dev-panel"))}>
					Developer panel
				</Button>
				<Segmented
					aria-label={t("dev.theme")}
					value={theme}
					onChange={(value) => setTheme(value as "light" | "dark")}
					options={[
						{ value: "light", label: t("common.theme.light") },
						{ value: "dark", label: t("common.theme.dark") },
					]}
				/>
				<Segmented
					aria-label={t("common.language")}
					value={locale}
					onChange={(value) => setLocale(value === "zh-CN" ? "zh-CN" : "en")}
					options={[
						{ value: "zh-CN", label: t("common.locale.zhCN") },
						{ value: "en", label: t("common.locale.en") },
					]}
				/>
				<Segmented
					aria-label={t("dev.width")}
					value={width}
					onChange={setWidth}
					options={[
						{ value: "phone", label: t("dev.phone") },
						{ value: "desktop", label: t("dev.desktop") },
					]}
				/>
				<Checkbox checked={grid} onChange={(event) => setGrid(event.target.checked)}>
					{t("dev.baseline")}
				</Checkbox>
			</header>

			<div className="mx-auto flex max-w-[1400px] justify-center">
				<div
					className={`relative w-full rounded-[var(--radius-panel)] bg-[var(--color-bg-surface)] p-[var(--spacing-6)] ${width === "phone" ? "max-w-[390px]" : ""}`}
				>
					{grid ? (
						<div
							aria-hidden="true"
							className="pointer-events-none absolute inset-0 z-50 opacity-40"
							style={{
								backgroundImage:
									"repeating-linear-gradient(to bottom, var(--color-border-strong) 0 1px, transparent 1px 8px)",
							}}
						/>
					) : null}
					<div className="flex flex-col gap-[var(--spacing-12)]">
						<p className="text-caption text-[var(--color-text-secondary)]">{t("dev.interact")}</p>
						<ButtonPreviews />
						<FieldPreviews />
						<NoticePreviews />
						<ReplyPreviews />
						<TokenPreviews theme={theme} />
					</div>
				</div>
			</div>
		</main>
	);
}
