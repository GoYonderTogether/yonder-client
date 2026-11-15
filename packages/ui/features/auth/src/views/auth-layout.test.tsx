// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createMemoryStorage, DataProvider, useLocalePreference } from "@yonder/ui-data";
import { createI18n } from "@yonder/ui-i18n";
import { useMemo } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { expect, test, vi } from "vitest";
import { AuthLayout } from "./auth-layout.tsx";

function Title() {
	const { t } = useTranslation();
	return <h1>{t("auth.signInTitle")}</h1>;
}

function LocalisedLayout() {
	const { locale } = useLocalePreference();
	const i18n = useMemo(() => createI18n(locale), [locale]);
	return (
		<I18nextProvider i18n={i18n}>
			<AuthLayout>
				<Title />
			</AuthLayout>
		</I18nextProvider>
	);
}

test("the language button updates the stored preference and visible page in both directions", async () => {
	const storage = createMemoryStorage();
	storage.set("locale", "zh-CN");
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
	const user = userEvent.setup();
	render(
		<DataProvider baseUrl="" appVersion="test" clientKind="web" storage={storage}>
			<LocalisedLayout />
		</DataProvider>,
	);
	expect(screen.getByRole("heading", { name: "登录 Yonder" })).toBeInTheDocument();
	await user.click(screen.getByRole("button", { name: "English" }));
	expect(storage.get("locale")).toBe("en");
	expect(screen.getByRole("heading", { name: "Sign in to Yonder" })).toBeInTheDocument();
	await user.click(screen.getByRole("button", { name: "中文" }));
	expect(storage.get("locale")).toBe("zh-CN");
	expect(screen.getByRole("heading", { name: "登录 Yonder" })).toBeInTheDocument();
	vi.unstubAllGlobals();
});
