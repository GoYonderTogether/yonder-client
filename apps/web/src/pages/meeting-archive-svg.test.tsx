// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { renderMeetingArchiveSvg } from "./meeting-archive-svg.tsx";
import { MessageContent } from "./message-content.tsx";

const renderBlock = (lang: string | undefined, text: string) =>
	lang === "svg" ? renderMeetingArchiveSvg(text, "Recording notes diagram") : null;
const fence = (language: string, content: string) => `\`\`\`${language}\n${content}\n\`\`\``;
const diagram =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 64"><g fill="#b4d7fc"><rect width="180" height="64" rx="8"/><text x="90" y="32" text-anchor="middle" fill="black">Next step</text></g></svg>';

test("only an opt-in fenced SVG becomes a diagram; raw SVG and Mermaid stay inert", () => {
	const open = vi.fn();
	const { container, getByRole, getByText } = render(
		<I18nextProvider i18n={createI18n("en")}>
			<MessageContent
				body={[
					"[Decision evidence](#batch-2) [Recording photo](#photo-internal-a) [Missing photo](#photo-missing)",
					fence("svg", diagram),
					diagram,
					fence("mermaid", "flowchart LR; A-->B"),
				].join("\n\n")}
				renderCodeBlock={renderBlock}
				sourceAction={(id) => (id === "batch-2" || id === "photo-internal-a" ? () => open(id) : undefined)}
			/>
			<MessageContent body={fence("svg", diagram)} />
		</I18nextProvider>,
	);
	const figure = getByRole("img", { name: "Recording notes diagram" });
	expect(figure.tagName).toBe("svg");
	expect(figure.getAttribute("viewBox")).toBe("0 0 180 64");
	expect(figure.querySelector("text")?.textContent).toBe("Next step");
	expect(figure.querySelector("rect")?.namespaceURI).toBe("http://www.w3.org/2000/svg");
	expect(container.querySelectorAll("svg.recording-reader-diagram")).toHaveLength(1);
	expect(container.querySelectorAll("pre")).toHaveLength(2);
	fireEvent.click(getByRole("button", { name: "Decision evidence" }));
	fireEvent.click(getByRole("button", { name: "Recording photo" }));
	expect(open.mock.calls).toEqual([["batch-2"], ["photo-internal-a"]]);
	expect(getByText("Missing photo").tagName).toBe("SPAN");
});

test.each([
	'<rect width="3" onload="window.evil=true"/>',
	"<script>window.evil=true</script>",
	'<image href="https://external-example.invalid/call.png"/>',
	'<use href="https://external-example.invalid/file.svg#view"/>',
	'<rect fill="url(https://external-example.invalid/file.svg#gradient)"/>',
	'<rect style="background-image:url(https://external-example.invalid/file.png)"/>',
	"<foreignObject><div>unsafe HTML</div></foreignObject>",
	'<g xmlns="urn:unknown"><rect width="3"/></g>',
	'<path d="M0 0 LNaN 90"/>',
	'<rect width="1e60"/>',
	`<g>${'<circle r="1"/>'.repeat(101)}</g>`,
])("rejects unsupported or active SVG as safe, copyable code: %s", (content) => {
	const source = `<svg viewBox="0 0 100 100">${content}</svg>`;
	const { container } = render(
		<I18nextProvider i18n={createI18n("en")}>
			<MessageContent body={fence("svg", source)} renderCodeBlock={renderBlock} />
		</I18nextProvider>,
	);
	expect(container.querySelector(".recording-reader-diagram")).toBeNull();
	expect(container.querySelector("script,image,foreignObject,use")).toBeNull();
	expect(container.querySelector("pre")?.textContent).toContain(source);
});

test("rejects XML declarations and entity definitions before parsing", () => {
	const unsafe =
		'<!DOCTYPE svg [<!ENTITY read SYSTEM "https://external-example.invalid/">]><svg viewBox="0 0 10 10"><text>&read;</text></svg>';
	expect(renderMeetingArchiveSvg(unsafe, "diagram")).toBeNull();
});
