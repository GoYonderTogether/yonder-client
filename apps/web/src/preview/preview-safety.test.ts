// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { sanitizeDocument, validateDocxSize } from "./docx-preview.tsx";
import { previewKind } from "./file-kind.ts";

test("Office HTML preserves paragraphs, tables and embedded images but cannot load external resources", () => {
	const html = sanitizeDocument(
		'<h1>中文标题</h1><table><tr><td>正文</td></tr></table><img src="data:image/png;base64,aGVsbG8="><img src="https://private.example/tracker"><video src="https://private.example/movie"></video><p style="background:url(https://private.example/css)" onclick="alert(1)">内容<script>alert(1)</script></p><a href="javascript:alert(1)">bad</a>',
	);
	const container = document.createElement("div");
	container.innerHTML = html;
	expect(container.querySelector("h1")?.textContent).toBe("中文标题");
	expect(container.querySelector("td")?.textContent).toBe("正文");
	expect(container.querySelector("img")?.getAttribute("src")).toMatch(/^data:image/);
	expect(html).not.toMatch(/private\.example|onclick|javascript:|<script|<video|style=/);
});

test("real DOCX ZIP is accepted while excessive declared expansion is rejected before parsing", () => {
	const bytes = readFileSync(`${process.cwd()}/e2e/fixtures/attachment-preview/document.docx`);
	const buffer = Uint8Array.from(bytes).buffer;
	expect(() => validateDocxSize(buffer)).not.toThrow();
	const view = new DataView(buffer);
	for (let offset = 0; offset < buffer.byteLength - 46; offset++)
		if (view.getUint32(offset, true) === 0x02014b50) {
			view.setUint32(offset + 24, 70 * 1024 * 1024, true);
			break;
		}
	expect(() => validateDocxSize(buffer)).toThrow("docx_too_large");
	expect(() => validateDocxSize(new ArrayBuffer(2))).toThrow("docx_invalid");
});

test.each([
	["file", "image/heic", "image"],
	["photo.svg", "application/octet-stream", "image"],
	["file", "video/mp4", "video"],
	["file.doc", "application/msword", "doc"],
	["file.docx", "application/octet-stream", "docx"],
	["file.md", "text/plain", "markdown"],
	["file.bin", "application/octet-stream", "unsupported"],
])("classifies %s (%s) using actual format capability", (name, mimeType, kind) => {
	expect(previewKind({ name, mimeType })).toBe(kind);
});
