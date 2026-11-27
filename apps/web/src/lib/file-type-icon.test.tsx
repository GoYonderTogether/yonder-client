// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { FileTypeIcon } from "./file-type-icon.tsx";

test.each([
	["manual.PDF", "application/octet-stream", "pdf", "text-secondary"],
	["document.docx", "application/octet-stream", "word", "text-secondary"],
	["document", "application/msword", "word", "text-secondary"],
	["table.csv", "text/csv", "spreadsheet", "text-secondary"],
	["slides.pptx", "application/octet-stream", "slides", "text-secondary"],
	["clip.mp4", "application/octet-stream", "video", "text-secondary"],
	["song.mp3", "application/octet-stream", "audio", "text-secondary"],
	["photo", "image/png", "image", "text-secondary"],
	["notes.md", "application/octet-stream", "text", "text-secondary"],
	["unknown.bin", "application/octet-stream", "generic", "text-secondary"],
])("%s has a stable file type icon and token color", (name, mimeType, type, color) => {
	const { container } = render(<FileTypeIcon file={{ name, mimeType }} size={32} />);
	const icon = container.firstElementChild as HTMLElement;
	expect(icon.dataset.fileType).toBe(type);
	expect(icon.style.color).toBe(`var(--color-${color})`);
	expect(icon.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 48 48");
});
