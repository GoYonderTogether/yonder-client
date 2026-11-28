// The owner's reader keeps its transfer shapes separate from the file tool results.

import type { Attachment } from "../chat/chat.ts";

export interface ConnectorFilePreviewRequest {
	path: string;
	knownSha256?: string;
	delivery?: "auto" | "original";
	offset?: number;
	expectedSha256?: string;
}

export interface ConnectorFileTextPageRequest {
	offset: number;
	expectedSha256?: string;
}

export interface ConnectorFileTextPage {
	kind: "text_page";
	name: string;
	mimeType: string;
	/** SHA-256 of the original file, independent of how its pages are decoded. */
	sha256: string;
	offset: number;
	nextOffset: number | null;
	content: string;
	/** SHA-256 of the UTF-8 encoding of content. */
	pageSha256: string;
}

export interface ConnectorFileDownload {
	kind: "download";
	name: string;
	mimeType: string;
	size: number;
	sha256: string;
	url: string;
	receipt: string;
}

export type ConnectorFilePreviewStatus =
	| { kind: "directory"; entries: { name: string; type: "file" | "directory" }[]; truncated: boolean }
	| { kind: "unchanged"; sha256: string };

export type ConnectorFilePreviewResult =
	| ConnectorFilePreviewStatus
	| ConnectorFileTextPage
	| { kind: "file"; sha256: string; attachment: Attachment };
