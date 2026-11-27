// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { MessageContent } from "./message-content.tsx";

test("renders Markdown without executing raw HTML, unsafe links or loading images", () => {
	const { container, getByText } = render(
		<MessageContent
			body={
				"**Answer**\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![external](https://example.org/image.png)"
			}
		/>,
	);
	expect(getByText("Answer").tagName).toBe("STRONG");
	expect(container.querySelector("script")).toBeNull();
	expect(container.querySelector("img")).toBeNull();
	expect(container.querySelector("a")?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
});

test("local URLs and private references remain text outside an authorized chat", () => {
	const { container, getByText } = render(
		<MessageContent body={"[本机地址](file:///private/report.md) [私有文件](yonder-file:connection/report.md)"} />,
	);
	expect(getByText(/本机地址.*私有文件/u)).toBeTruthy();
	expect(container.querySelector("a,button")).toBeNull();
});

test("archive citations only activate known stable sources, while HTML and diagrams stay inert", () => {
	const open = vi.fn();
	const { container, getByRole, getByText } = render(
		<I18nextProvider i18n={createI18n("en")}>
			<MessageContent
				body={[
					"[evidence](#batch-2) [unavailable](#batch-9)",
					"<script>alert(1)</script>",
					"![external](https://example.org/photo.jpg)",
					`\`\`\`mermaid\ngraph TD; A-->B\n\`\`\``,
				].join("\n\n")}
				sourceAction={(id) => (id === "batch-2" ? () => open(id) : undefined)}
			/>
		</I18nextProvider>,
	);
	fireEvent.click(getByRole("button", { name: "evidence" }));
	expect(open).toHaveBeenCalledExactlyOnceWith("batch-2");
	expect(getByText("unavailable").tagName).toBe("SPAN");
	expect(container.querySelector("script,img")).toBeNull();
	expect(container.querySelector("pre")?.textContent).toContain("graph TD; A-->B");
});

test.each(["https://yonder.zethai.cn", "https://example.org/path?q=1"])(
	"keeps Chinese punctuation after %s out of the link",
	(url) => {
		const { container, getByText } = render(<MessageContent body={`查看 ${url}。后文`} />);
		const link = getByText(url);
		expect(link.getAttribute("href")).toBe(url);
		expect(container.textContent).toBe(`查看 ${url}。后文`);
	},
);

test("preserves explicit links, Chinese paths, normal links and code", () => {
	const body = [
		"[明确](https://example.com/中文。路径)",
		"[https://example.com/中文。路径](https://example.com/中文。路径)",
		"<https://example.com/中文。路径>",
		"https://example.com/中文路径",
		"https://example.com/中文。路径",
		"https://example.org/path",
		"http://example.net/path",
		"www.example.net/path",
		"person@example.net",
		"`https://example.com。行内代码`",
		"```\nhttps://example.com。代码块\n```",
	].join("\n\n");
	const { container } = render(<MessageContent body={body} />);
	const links = [...container.querySelectorAll("a")];
	expect(links).toHaveLength(9);
	expect(links.slice(0, 3).map((link) => decodeURI(link.getAttribute("href") ?? ""))).toEqual([
		"https://example.com/中文。路径",
		"https://example.com/中文。路径",
		"https://example.com/中文。路径",
	]);
	expect(decodeURI(links[3]?.getAttribute("href") ?? "")).toBe("https://example.com/中文路径");
	expect(decodeURI(links[4]?.getAttribute("href") ?? "")).toBe("https://example.com/中文。路径");
	expect(links[5]?.getAttribute("href")).toBe("https://example.org/path");
	expect(links[6]?.getAttribute("href")).toBe("http://example.net/path");
	expect(links[7]?.getAttribute("href")).toBe("http://www.example.net/path");
	expect(links[8]?.getAttribute("href")).toBe("mailto:person@example.net");
	expect(container.querySelectorAll("code")).toHaveLength(2);
	expect(container.querySelector("code")?.textContent).toBe("https://example.com。行内代码");
	expect(container.querySelectorAll("code")[1]?.textContent).toBe("https://example.com。代码块");
});

test("does not alter explicit links whose destinations contain a Chinese full stop", () => {
	const body = [
		"[名称](https://example.org。站点)",
		"[https://example.org。站点](https://example.org。站点)",
		"[路径](https://example.org/path?q=1。站点)",
		"<https://example.org。站点>",
		"[引用][site]",
		"[site]: https://example.org。站点",
		"https://yonder.zethai.cn。后文",
	].join("\n\n");
	const { container } = render(<MessageContent body={body} />);
	const links = [...container.querySelectorAll("a")];
	expect(links).toHaveLength(6);
	expect(links.slice(0, 5).map((link) => decodeURI(link.getAttribute("href") ?? ""))).toEqual([
		"https://example.org。站点",
		"https://example.org。站点",
		"https://example.org/path?q=1。站点",
		"https://example.org。站点",
		"https://example.org。站点",
	]);
	expect(links[5]?.getAttribute("href")).toBe("https://yonder.zethai.cn");
});

test("leaves an ambiguous bare link alone when the same link is also explicit", () => {
	const url = "https://example.com。中国";
	const { container } = render(<MessageContent body={`[${url}](${url})\n\n${url}`} />);
	const links = [...container.querySelectorAll("a")];
	expect(links).toHaveLength(2);
	expect(links.map((link) => decodeURI(link.getAttribute("href") ?? ""))).toEqual([url, url]);
});

test("updates the link correctly while a message streams", () => {
	const { container, rerender } = render(<MessageContent body="查看 https://yonder.zethai.cn" />);
	for (const suffix of ["。", "。后", "。后文"]) {
		rerender(<MessageContent body={`查看 https://yonder.zethai.cn${suffix}`} />);
		expect(container.querySelector("a")?.getAttribute("href")).toBe("https://yonder.zethai.cn");
		expect(container.textContent).toBe(`查看 https://yonder.zethai.cn${suffix}`);
	}
});

test("keeps a quote as its own block and a path as inline code", () => {
	const { container } = render(
		<MessageContent body={"你说过：\n> 转写质量太差。\n\n改动在 `src/pages/message-content.tsx`。"} />,
	);
	const quote = container.querySelector("blockquote");
	expect(quote?.className).toContain("message-content-blockquote");
	expect(quote?.textContent).toBe("转写质量太差。");
	const code = container.querySelector("code");
	expect(code?.className).toBe("message-content-inline-code");
	expect(code?.textContent).toBe("src/pages/message-content.tsx");
	expect(container.querySelector("pre")).toBeNull();
});

test("keeps Markdown tables semantic and keyboard focusable", () => {
	const { getByRole } = render(<MessageContent body={"| 项目 | 内容 |\n| --- | --- |\n| 目标 | 示例 |"} />);
	expect(getByRole("table").getAttribute("tabindex")).toBe("0");
	expect(getByRole("columnheader", { name: "项目" })).toBeTruthy();
	expect(getByRole("cell", { name: "目标" })).toBeTruthy();
});

test("animates only incoming stream text and settles old glyphs without changing Markdown semantics", () => {
	vi.useFakeTimers();
	try {
		const { container, rerender } = render(<MessageContent body="**你好**" streaming />);
		expect(container.querySelector("strong")?.textContent).toBe("你好");
		expect(container.querySelectorAll(".stream-character")).toHaveLength(2);
		act(() => vi.advanceTimersByTime(120));
		expect(container.querySelectorAll(".stream-character")).toHaveLength(0);
		rerender(<MessageContent body="**你好呀**" streaming />);
		expect(container.querySelector("strong")?.textContent).toBe("你好呀");
		expect([...container.querySelectorAll(".stream-character")].map((node) => node.textContent)).toEqual(["呀"]);
		act(() => vi.advanceTimersByTime(90));
		expect(container.querySelectorAll(".stream-character")).toHaveLength(0);
		rerender(<MessageContent body="**你好呀**" />);
		expect(container.querySelector("strong")?.textContent).toBe("你好呀");
	} finally {
		vi.useRealTimers();
	}
});

test("retains file extensions, full accessible names and destinations without changing ordinary links", () => {
	const name = "这是一份很长很长很长的需求说明.pdf";
	const { container, getByRole } = render(
		<MessageContent body={`[${name}](/files/report.pdf) [普通长链接](https://example.org/report.pdf)`} />,
	);
	const file = getByRole("link", { name });
	expect(file.getAttribute("href")).toBe("/files/report.pdf");
	expect(file.querySelector("span:last-child")?.textContent).toBe(".pdf");
	expect(file.textContent).toBe(name);
	expect(container.querySelectorAll(".message-file-link")).toHaveLength(1);
});

test("copies only code, resets success after 2.5 seconds and reports clipboard failures", async () => {
	vi.useFakeTimers();
	const writeText = vi.fn().mockResolvedValue(undefined);
	vi.stubGlobal("navigator", { clipboard: { writeText } });
	try {
		const { container, getByRole, unmount } = render(
			<I18nextProvider i18n={createI18n("zh-CN")}>
				<MessageContent body={"```js\nconst answer = 42;\n```"} />
			</I18nextProvider>,
		);
		await act(async () => fireEvent.click(getByRole("button", { name: "复制" })));
		expect(writeText).toHaveBeenCalledExactlyOnceWith("const answer = 42;");
		expect(getByRole("button", { name: "已复制" })).toBeTruthy();
		act(() => vi.advanceTimersByTime(2499));
		expect(getByRole("button", { name: "已复制" })).toBeTruthy();
		act(() => vi.advanceTimersByTime(1));
		expect(getByRole("button", { name: "复制" })).toBeTruthy();
		await act(async () => fireEvent.click(getByRole("button", { name: "复制" })));
		expect(getByRole("button", { name: "已复制" })).toBeTruthy();
		writeText.mockRejectedValueOnce(new Error("Denied"));
		await act(async () => fireEvent.click(getByRole("button", { name: "已复制" })));
		expect(getByRole("alert").textContent).toBe("复制失败");
		expect(getByRole("button", { name: "复制" })).toBeTruthy();
		expect(container.querySelector("pre code")?.textContent).toBe("const answer = 42;");
		unmount();
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	}
});

test("staggering continues across stream chunks and never splits a grapheme", () => {
	vi.useFakeTimers();
	try {
		const { container, rerender } = render(<MessageContent body="你" streaming />);
		const original = container.querySelector(".stream-character");
		act(() => vi.advanceTimersByTime(5));
		rerender(<MessageContent body="你好👨‍👩‍👧‍👦é" streaming />);
		const characters = [...container.querySelectorAll<HTMLElement>(".stream-character")];
		expect(characters[0]).toBe(original);
		expect(characters.map((node) => node.textContent)).toEqual(["你", "好", "👨‍👩‍👧‍👦", "é"]);
		expect(characters[1]?.style.getPropertyValue("--batch-delay")).toBe("25ms");
		expect(characters[2]?.style.getPropertyValue("--character-index")).toBe("1");
		act(() => vi.advanceTimersByTime(85));
		expect(container.querySelector(".stream-character")).toBe(characters[1]);
		act(() => vi.advanceTimersByTime(90));
		expect(container.querySelectorAll(".stream-character")).toHaveLength(0);
		expect(container.textContent).toBe("你好👨‍👩‍👧‍👦é");
	} finally {
		vi.useRealTimers();
	}
});

test.each([
	["e", "é"],
	["👨", "👨‍👩‍👧‍👦"],
])("joins a partial streamed grapheme %s without splitting or replaying it", (start, complete) => {
	vi.useFakeTimers();
	try {
		const { container, rerender } = render(<MessageContent body={start} streaming />);
		const character = container.querySelector(".stream-character");
		rerender(<MessageContent body={complete} streaming />);
		expect(container.querySelectorAll(".stream-character")).toHaveLength(1);
		expect(container.querySelector(".stream-character")).toBe(character);
		expect(character?.textContent).toBe(complete);
		act(() => vi.advanceTimersByTime(90));
		expect(container.querySelectorAll(".stream-character")).toHaveLength(0);
		expect(container.textContent).toBe(complete);
	} finally {
		vi.useRealTimers();
	}
});
