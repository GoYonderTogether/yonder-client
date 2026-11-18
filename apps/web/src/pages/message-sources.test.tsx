// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import type { Run } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test } from "vitest";
import { MessageSources } from "./message-sources.tsx";

const run: Run = { id: "r1", conversationId: "c1", messageId: "m1", userMessageId: "u1", status: "running" };
const source = { title: "Page title", site: "Site", url: "https://example.com/page" };
const view = (value?: Run) => (
	<I18nextProvider i18n={createI18n("zh-CN")}>
		<MessageSources run={value} />
	</I18nextProvider>
);

test("no tool labels, progress, or empty controls remain without sources", () => {
	const screen = render(view());
	expect(screen.container.innerHTML).toBe("");
	screen.rerender(view({ ...run, activity: [{ label: "查看了记忆" }, { label: "工具调用失败" }] }));
	expect(screen.container.innerHTML).toBe("");
});

test("one independent source entry exposes actual links, not tool activity", () => {
	const screen = render(view({ ...run, activity: [{ label: "搜索网页", sources: [source, source] }] }));
	expect(screen.container.textContent).toBe("来源");
	expect(screen.queryByRole("link")).toBeNull();
	const button = screen.getByRole("button", { name: "来源" });
	fireEvent.click(button);
	expect(button.getAttribute("aria-expanded")).toBe("true");
	expect(screen.getAllByRole("link")).toHaveLength(1);
	expect(screen.getByRole("link", { name: "Page title" }).getAttribute("href")).toBe(source.url);
	expect(screen.getByRole("link").getAttribute("rel")).toBe("noopener noreferrer");
	expect(screen.queryByText("搜索网页")).toBeNull();
	fireEvent.click(button);
	expect(screen.queryByRole("link")).toBeNull();
});

test("subscribed updates keep same-run sources and reset disclosure for another run", () => {
	const value = { ...run, activity: [{ label: "Search", sources: [source] }] };
	const screen = render(view(value));
	fireEvent.click(screen.getByRole("button"));
	screen.rerender(
		view({
			...value,
			activity: [
				...value.activity,
				{ label: "Search", sources: [{ ...source, title: "Next", url: "https://example.com/next" }] },
			],
		}),
	);
	expect(screen.getAllByRole("link")).toHaveLength(2);
	screen.rerender(view({ ...value, id: "r2" }));
	expect(screen.queryByRole("link")).toBeNull();
});
