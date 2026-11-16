import { Plus } from "lucide-react";
import type { DragEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export const isFileDrag = (event: Pick<DragEvent, "dataTransfer">) => [...event.dataTransfer.types].includes("Files");

export function FileDropZone({
	children,
	onFiles,
	disabled,
}: {
	children: ReactNode;
	onFiles: (files: File[]) => void;
	disabled: boolean;
}) {
	const { t } = useTranslation();
	const depth = useRef(0);
	const [over, setOver] = useState(false);
	return (
		<fieldset
			className="relative flex min-h-0 min-w-0 flex-1 flex-col"
			aria-label={t("chat.dropFiles")}
			onDragEnter={(event) => {
				if (!isFileDrag(event) || disabled) return;
				event.preventDefault();
				depth.current++;
				setOver(true);
			}}
			onDragOver={(event) => {
				if (isFileDrag(event)) {
					event.preventDefault();
					event.dataTransfer.dropEffect = disabled ? "none" : "copy";
				}
			}}
			onDragLeave={(event) => {
				if (!isFileDrag(event)) return;
				depth.current = Math.max(0, depth.current - 1);
				if (!depth.current) setOver(false);
			}}
			onDrop={(event) => {
				if (!isFileDrag(event)) return;
				event.preventDefault();
				depth.current = 0;
				setOver(false);
				if (!disabled) onFiles([...event.dataTransfer.files]);
			}}
		>
			{children}
			{over ? (
				<div className="file-drop-overlay" role="status">
					<span className="file-drop-plus">
						<Plus size={32} aria-hidden="true" />
					</span>
					<span>{t("chat.dropFiles")}</span>
				</div>
			) : null}
		</fieldset>
	);
}
