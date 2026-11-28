import { expect, test } from "vitest";
import { isTextAttachment, splitTextAttachment } from "./text-attachment.ts";

test.each(["srt", "VTT", "ass", "tsv", "jsonl", "ndjson", "ini", "conf", "toml", "sql"])(
	"recognizes the .%s text extension",
	(extension) => {
		expect(isTextAttachment(`file.${extension}`, "application/octet-stream")).toBe(true);
	},
);

test("recognizes specific text MIME types while leaving unfamiliar binaries alone", () => {
	expect(isTextAttachment("subtitle", "application/x-subrip; charset=UTF-8")).toBe(true);
	expect(isTextAttachment("records", "application/x-ndjson")).toBe(true);
	expect(isTextAttachment("file.bin", "application/octet-stream")).toBe(false);
	expect(isTextAttachment("file.zip", "application/zip")).toBe(false);
});

test("splits complete lines and preserves CRLF and surrogate pairs in long lines", () => {
	const text = "行一\r\n长一段的第😀行\r\n最后";
	const pages = splitTextAttachment(text, 7);
	expect(pages).toEqual(["行一\r\n", "长一段的第😀", "行\r\n最后"]);
	expect(pages.join("")).toBe(text);
	expect(splitTextAttachment("😀\r\n行", 1)).toEqual(["😀", "\r\n", "行"]);
});
