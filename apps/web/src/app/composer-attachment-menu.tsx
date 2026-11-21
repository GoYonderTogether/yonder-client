import { Camera, FileAudio, FileText, Image } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";

export function ComposerAttachmentMenu({
	panel,
	mobile,
	direct,
	onImages,
	onCamera,
	onFiles,
	onMeeting,
	onClose,
}: {
	panel: RefObject<HTMLFieldSetElement | null>;
	mobile: boolean;
	direct: boolean;
	onImages?: (() => void) | undefined;
	onCamera?: (() => void) | undefined;
	onFiles: () => void;
	onMeeting?: (() => void) | undefined;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	function choose(action: () => void) {
		onClose();
		action();
	}
	const actions = (
		<>
			{onImages ? (
				<button type="button" onClick={() => choose(onImages)}>
					<Image size={18} aria-hidden="true" />
					{t("composerAttachments.album")}
				</button>
			) : null}
			{onCamera ? (
				<button type="button" onClick={() => choose(onCamera)}>
					<Camera size={18} aria-hidden="true" />
					{t("composerAttachments.camera")}
				</button>
			) : null}
			<button type="button" onClick={() => choose(onFiles)}>
				<FileText size={18} aria-hidden="true" />
				{t(direct ? "composerAttachments.sendFile" : "chat.uploadFiles")}
			</button>
			{onMeeting ? (
				<button type="button" onClick={() => choose(onMeeting)}>
					<FileAudio size={18} aria-hidden="true" />
					{t("chatActions.recordMeeting")}
				</button>
			) : null}
		</>
	);
	return (
		<fieldset
			ref={panel}
			className={mobile ? "composer-mobile-attachment-grid" : "composer-add-menu"}
			aria-label={t("chat.attach")}
			onKeyDown={(event) => {
				if (event.key === "Escape") onClose();
			}}
		>
			{mobile ? <div className="composer-attachment-icons">{actions}</div> : actions}
		</fieldset>
	);
}

export function ComposerFileInputs({
	files,
	images,
	camera,
	onFiles,
}: {
	files: RefObject<HTMLInputElement | null>;
	images: RefObject<HTMLInputElement | null>;
	camera: RefObject<HTMLInputElement | null> | undefined;
	onFiles: (selected: File[], original: boolean) => void;
}) {
	const { t } = useTranslation();
	function receive(event: ChangeEvent<HTMLInputElement>, original: boolean) {
		onFiles([...(event.target.files ?? [])], original);
		event.target.value = "";
	}
	return (
		<>
			<input
				ref={files}
				type="file"
				multiple
				className="hidden"
				aria-label={t("chat.uploadFiles")}
				onChange={(event) => receive(event, true)}
			/>
			<input
				ref={images}
				type="file"
				accept="image/*"
				multiple
				className="hidden"
				aria-label={t("chat.uploadImages")}
				onChange={(event) => receive(event, false)}
			/>
			{camera ? (
				<input
					ref={camera}
					type="file"
					accept="image/*"
					capture="environment"
					className="hidden"
					aria-label={t("composerAttachments.camera")}
					onChange={(event) => receive(event, false)}
				/>
			) : null}
		</>
	);
}
