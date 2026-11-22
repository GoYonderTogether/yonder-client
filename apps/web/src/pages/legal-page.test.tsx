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
	const pinned: Record<typeof kind, Record<typeof locale, string[]>> = {
		terms: {
			"zh-CN": [
				"我们会将必要的内容发送给模型服务商",
				"我们不会使用可以识别你的内容训练面向公众的基础模型。",
				"不得删除、篡改、伪造或隐匿",
			],
			en: [
				"we send necessary content to model providers",
				"We will not use your identifiable content to train foundation models offered to the public.",
				"You must not delete, alter, forge or conceal",
			],
		},
		privacy: {
			"zh-CN": [
				"AI 与模型服务商",
				"我们不会使用可以识别你的对话、记忆、附件、录音和文件内容，训练面向公众的基础模型",
				"密钥会加密存储",
			],
			en: [
				"AI and model providers",
				"We will not use your identifiable conversations, memory, attachments, recordings or file content to train foundation models offered to the public",
				"The key is stored encrypted.",
			],
		},
	};
	for (const text of pinned[kind][locale]) expect(container.textContent).toContain(text);
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
