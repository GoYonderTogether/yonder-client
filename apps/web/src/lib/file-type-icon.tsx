import { FileGlyph, type FileGlyphType } from "@yonder/ui-components";
import "./file-type-icon.css";

const COLORS: Record<FileGlyphType, string> = {
	pdf: "text-secondary",
	word: "text-secondary",
	spreadsheet: "text-secondary",
	slides: "text-secondary",
	video: "text-secondary",
	audio: "text-secondary",
	image: "text-secondary",
	text: "text-secondary",
	generic: "text-secondary",
};

function fileType(name: string, mime: string): FileGlyphType {
	if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
	if (/\.(docx?)$/.test(name) || /msword|wordprocessingml/.test(mime)) return "word";
	if (/\.(xlsx?|csv|ods)$/.test(name) || /spreadsheet|ms-excel|text\/csv/.test(mime)) return "spreadsheet";
	if (/\.(pptx?|odp)$/.test(name) || /presentation|powerpoint/.test(mime)) return "slides";
	if (mime.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/.test(name)) return "video";
	if (mime.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac)$/.test(name)) return "audio";
	if (mime.startsWith("image/")) return "image";
	if (mime.startsWith("text/") || /\.(txt|md|json|log)$/.test(name)) return "text";
	return "generic";
}

/** A folded page in the file type's own colour; what is cut out of it says what the file is. */
export function FileTypeIcon({ file, size = 30 }: { file: { name: string; mimeType: string }; size?: number }) {
	const type = fileType(file.name.toLowerCase(), file.mimeType.toLowerCase());
	return (
		<span
			className="file-type-icon"
			data-file-type={type}
			aria-hidden="true"
			style={{ width: size, height: size, color: `var(--color-${COLORS[type]})` }}
		>
			<FileGlyph type={type} size={size} />
		</span>
	);
}
