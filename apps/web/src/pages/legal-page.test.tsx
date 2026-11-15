// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { getLegalDocument } from "@yonder/feature-legal";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { expect, test } from "vitest";
import { LegalPage } from "./legal-page.tsx";

test.each([
	["terms", "zh-CN"],
	["privacy", "zh-CN"],
	["terms", "en"],
	["privacy", "en"],
] as const)("renders every emphasized clause in %s (%s)", (kind, locale) => {
	const document = getLegalDocument(kind, locale);
	const paragraphs = [...document.intro, ...document.sections.flatMap((section) => section.paragraphs)];
	const emphasis = paragraphs.flatMap((paragraph) =>
		Array.from(paragraph.matchAll(/\*\*(.+?)\*\*/g), (match) => match[1]),
	);
	const { container } = render(
		<I18nextProvider i18n={createI18n(locale)}>
			<MemoryRouter>
				<LegalPage kind={kind} />
			</MemoryRouter>
		</I18nextProvider>,
	);
	expect(emphasis.length).toBeGreaterThan(0);
	expect(container.textContent).not.toContain("**");
	expect(container.textContent).not.toMatch(/RightCode|rightapi\.ai/i);
	expect(container.textContent).toContain(
		locale === "zh-CN"
			? "我们会将必要的对话内容发送给所选模型对应的服务。"
			: "we send necessary conversation content to the service for the selected model.",
	);
	if (kind === "privacy") {
		expect(container.textContent).toContain(
			locale === "zh-CN"
				? "密钥会加密存储，只用于你发起的调用。"
				: "the key is stored encrypted and used only for calls you initiate.",
		);
	}
	expect([...container.querySelectorAll("strong")].map((element) => element.textContent)).toEqual(emphasis);
});

test.each([
	["terms", "zh-CN"],
	["privacy", "zh-CN"],
	["terms", "en"],
	["privacy", "en"],
] as const)("links to the Yonder website in %s (%s)", (kind, locale) => {
	const { getByRole } = render(
		<I18nextProvider i18n={createI18n(locale)}>
			<MemoryRouter>
				<LegalPage kind={kind} />
			</MemoryRouter>
		</I18nextProvider>,
	);
	expect(getByRole("link", { name: "https://yonder.zethai.cn" })).toHaveAttribute("href", "https://yonder.zethai.cn");
});
