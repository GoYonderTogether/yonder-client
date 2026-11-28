import { isTextAttachment } from "@yonder/chat-model";

export interface PreviewFile {
	name: string;
	mimeType: string;
	blob: Blob;
	id?: string;
}
export type PreviewKind = "image" | "pdf" | "docx" | "doc" | "markdown" | "text" | "audio" | "video" | "unsupported";

export function previewKind(file: Pick<PreviewFile, "name" | "mimeType">): PreviewKind {
	const name = file.name.toLowerCase();
	const mime = (file.mimeType.split(";", 1)[0] ?? "").trim().toLowerCase();
	if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif|svg)$/.test(name)) return "image";
	if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
	if (name.endsWith(".docx") || mime.includes("wordprocessingml")) return "docx";
	if (name.endsWith(".doc") || mime === "application/msword") return "doc";
	if (/\.(md|markdown)$/.test(name) || mime === "text/markdown") return "markdown";
	if (mime.startsWith("audio/") || /\.(mp3|m4a|wav|ogg|opus|flac|aac)$/.test(name)) return "audio";
	if (mime.startsWith("video/") || /\.(mp4|m4v|mov|webm|avi|mkv)$/.test(name)) return "video";
	return isTextAttachment(name, mime) ? "text" : "unsupported";
}
