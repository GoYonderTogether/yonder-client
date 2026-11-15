import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";

// Vitest runs in Node; load the real browser bundle that accepts ArrayBuffer like Vite's browser unzip adapter.
vi.mock("mammoth", async () => vi.importActual<typeof import("mammoth")>("mammoth/mammoth.browser.js"));

import { createDocumentThumbnail } from "./document-thumbnail.ts";

test("a genuine DOCX provides bounded Chinese/table text for the draft canvas", async () => {
	const bytes = readFileSync(`${process.cwd()}/e2e/fixtures/attachment-preview/document.docx`);
	const result = await createDocumentThumbnail(
		{
			name: "document.docx",
			mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			blob: new Blob([bytes]),
		},
		new AbortController().signal,
	);
	expect(result.text).toContain("中文");
	expect(result.text).toContain("98");
	expect(result.text).toContain("最后一段");
	expect(result.text?.length).toBeLessThanOrEqual(600);
	expect(result.blob).toBeUndefined();
});

test("an invalid DOCX cannot enter the Office parser as an unbounded draft thumbnail", async () => {
	await expect(
		createDocumentThumbnail(
			{ name: "bad.docx", mimeType: "application/octet-stream", blob: new Blob(["not a ZIP"]) },
			new AbortController().signal,
		),
	).rejects.toThrow("docx_invalid");
});
