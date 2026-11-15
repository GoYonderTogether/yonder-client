// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
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

test("keeps Markdown tables semantic and keyboard focusable", () => {
	const { getByRole } = render(<MessageContent body={"| 项目 | 内容 |\n| --- | --- |\n| 目标 | 示例 |"} />);
	expect(getByRole("table").getAttribute("tabindex")).toBe("0");
	expect(getByRole("columnheader", { name: "项目" })).toBeTruthy();
	expect(getByRole("cell", { name: "目标" })).toBeTruthy();
});
