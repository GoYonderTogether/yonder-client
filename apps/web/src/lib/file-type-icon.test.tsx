// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { FileTypeIcon } from "./file-type-icon.tsx";

test.each([
	["manual.PDF", "application/octet-stream", "pdf", "danger", "PDF"],
	["document.docx", "application/octet-stream", "word", "accent", "W"],
	["document", "application/msword", "word", "accent", "W"],
	["table.csv", "text/csv", "spreadsheet", "success", ""],
	["slides.pptx", "application/octet-stream", "slides", "warning", ""],
	["unknown.bin", "application/octet-stream", "generic", "text-tertiary", ""],
])("%s has a stable file type icon and token color", (name, mimeType, type, color, mark) => {
	const { container } = render(<FileTypeIcon file={{ name, mimeType }} size={32} />);
	const icon = container.firstElementChild as HTMLElement;
	expect(icon.dataset.fileType).toBe(type);
	expect(icon.style.color).toBe(`var(--color-${color})`);
	expect(icon.querySelector(".file-type-icon-mark")?.textContent ?? "").toBe(mark);
	if (type === "generic") expect(icon.querySelector("svg")).toHaveClass("lucide-file");
});
