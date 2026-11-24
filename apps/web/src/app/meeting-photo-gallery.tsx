import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MeetingPhoto } from "../lib/meeting-photos.ts";
import { ImagePreview } from "../preview/image-preview.tsx";
import "../preview/preview.css";
import "./meeting-camera.css";

export function MeetingPhotoGallery({
	photos,
	initialPhotoId,
	onClose,
}: {
	photos: readonly MeetingPhoto[];
	initialPhotoId: string;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const dialog = useRef<HTMLDialogElement>(null);
	const close = useRef<HTMLButtonElement>(null);
	const [id, select] = useState(initialPhotoId);
	const index = photos.findIndex((photo) => photo.id === id);
	const photo = photos[index];
	useLayoutEffect(() => {
		const panel = dialog.current;
		if (panel?.showModal) panel.showModal();
		else panel?.setAttribute("open", "");
		close.current?.focus();
		return () => {
			if (panel?.open) panel.close?.();
		};
	}, []);
	function navigate(delta: -1 | 1) {
		const next = photos[index + delta];
		if (next) select(next.id);
	}
	return (
		<dialog
			ref={dialog}
			data-theme="dark"
			className="meeting-photo-gallery"
			aria-label={t("meetingRecorder.photosOnDevice")}
			onCancel={(event) => {
				event.preventDefault();
				event.stopPropagation();
				onClose();
			}}
		>
			<header>
				<button
					ref={close}
					type="button"
					className="meeting-camera-control"
					aria-label={t("app.close")}
					onClick={onClose}
				>
					<X size={22} aria-hidden="true" />
				</button>
				{photo ? (
					<output>
						{index + 1} / {photos.length}
					</output>
				) : null}
				<span />
			</header>
			{photo ? (
				<ImagePreview
					key={photo.id}
					file={{
						name: t("meetingRecorder.cameraPhoto", {
							time: t("meetingRecorder.cardSeconds", { seconds: Math.floor(photo.elapsedMs / 1000) }),
						}),
						mimeType: "image/jpeg",
						blob: photo.image,
					}}
					onClose={onClose}
					onSwipe={navigate}
				/>
			) : null}
			<footer>
				<button
					type="button"
					className="meeting-camera-control"
					disabled={index < 1}
					aria-label={t("meetingRecorder.archivePrevious")}
					onClick={() => navigate(-1)}
				>
					<ChevronLeft size={20} aria-hidden="true" />
				</button>
				<button
					type="button"
					className="meeting-camera-control"
					disabled={index >= photos.length - 1}
					aria-label={t("meetingRecorder.archiveNext")}
					onClick={() => navigate(1)}
				>
					<ChevronRight size={20} aria-hidden="true" />
				</button>
			</footer>
		</dialog>
	);
}
