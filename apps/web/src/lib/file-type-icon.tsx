import { File, FileChartColumn, FileImage, FileSpreadsheet, FileText, Film, Music } from "lucide-react";
import "./file-type-icon.css";

export function FileTypeIcon({ file, size = 30 }: { file: { name: string; mimeType: string }; size?: number }) {
	const name = file.name.toLowerCase();
	const mime = file.mimeType.toLowerCase();
	const type =
		mime === "application/pdf" || name.endsWith(".pdf")
			? "pdf"
			: /\.(docx?)$/.test(name) || /msword|wordprocessingml/.test(mime)
				? "word"
				: /\.(xlsx?|csv|ods)$/.test(name) || /spreadsheet|ms-excel|text\/csv/.test(mime)
					? "spreadsheet"
					: /\.(pptx?|odp)$/.test(name) || /presentation|powerpoint/.test(mime)
						? "slides"
						: mime.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/.test(name)
							? "video"
							: mime.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac)$/.test(name)
								? "audio"
								: mime.startsWith("image/")
									? "image"
									: mime.startsWith("text/") || /\.(txt|md|json|log)$/.test(name)
										? "text"
										: "generic";
	const Icon =
		type === "word" || type === "text"
			? FileText
			: type === "spreadsheet"
				? FileSpreadsheet
				: type === "slides"
					? FileChartColumn
					: type === "video"
						? Film
						: type === "audio"
							? Music
							: type === "image"
								? FileImage
								: File;
	const color = `var(--color-${type === "pdf" ? "danger" : type === "word" ? "accent" : type === "spreadsheet" ? "success" : type === "slides" ? "warning" : "text-tertiary"})`;
	const mark = type === "pdf" ? "PDF" : type === "word" ? "W" : undefined;
	return (
		<span
			className="file-type-icon"
			data-file-type={type}
			aria-hidden="true"
			style={{ width: size, height: size, color }}
		>
			<Icon size={size} />
			{mark ? (
				<span
					className="file-type-icon-mark"
					style={{ fontSize: size * 0.24, backgroundColor: color, color: "var(--color-bg-surface)" }}
				>
					{mark}
				</span>
			) : null}
		</span>
	);
}
