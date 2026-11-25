import { Camera, Pause, Play, SwitchCamera, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MeetingPhoto } from "../lib/meeting-photos.ts";
import { isDesktopExperience, isMacDesktopShell } from "../lib/platform.ts";
import { useObjectUrl } from "../lib/use-object-url.ts";
import { MeetingPhotoGallery } from "./meeting-photo-gallery.tsx";
import "./meeting-camera.css";

const MAX_PHOTO_EDGE = 1920;
const CAMERA_FALLBACK = { ideal: "environment" };
type Zoom = { min: number; max: number; step?: number };
type Facing = "user" | "environment";
type Selection = { facing: Facing } | { deviceId: string };

export function MeetingCamera({
	elapsedMs,
	photoLimitReached,
	photos = [],
	paused = false,
	pauseBusy,
	onTogglePause,
	onClose,
	onPhoto,
}: {
	elapsedMs: number;
	photoLimitReached: boolean;
	photos?: readonly MeetingPhoto[];
	paused?: boolean;
	pauseBusy?: boolean;
	onTogglePause?: (() => Promise<void>) | undefined;
	onClose: () => void;
	onPhoto: (image: Promise<Blob>, elapsedMs: number) => Promise<void>;
}) {
	const { t } = useTranslation();
	const video = useRef<HTMLVideoElement>(null);
	const close = useRef<HTMLButtonElement>(null);
	useLayoutEffect(() => close.current?.focus(), []);
	const track = useRef<MediaStreamTrack | null>(null);
	const active = useRef(true);
	const previous = useRef<{ facing: Facing; deviceId: string | undefined } | undefined>(undefined);
	const [requested, setRequested] = useState<Selection>();
	const [deviceIds, setDeviceIds] = useState<string[]>([]);
	const mobile = !isDesktopExperience();
	const [canSwitch, setCanSwitch] = useState(false);
	const [error, setError] = useState<"cameraUnavailable" | "cameraPermission" | "photoFailed">();
	const [ready, setReady] = useState(false);
	const [saving, setSaving] = useState(false);
	const [zoom, setZoom] = useState<Zoom>();
	const [zoomValue, setZoomValue] = useState<number>();
	const [zoomBusy, setZoomBusy] = useState(false);
	const [flash, setFlash] = useState(0);
	const [animatePhoto, setAnimatePhoto] = useState(false);
	const [gallery, setGallery] = useState<string>();
	const thumbnail = useRef<HTMLButtonElement>(null);
	const latest = photos.at(-1);
	const presets = [0.5, 1, 2, 3, 5].filter((value) => {
		if (!zoom || value < zoom.min || value > zoom.max) return false;
		const offset = zoom.step ? (value - zoom.min) / zoom.step : 0;
		return Math.abs(offset - Math.round(offset)) < 0.0001;
	});

	useEffect(() => {
		active.current = true;
		const element = video.current;
		let stream: MediaStream | undefined;
		let removed = false;
		let camera: MediaStreamTrack | undefined;
		const ended = () => {
			setReady(false);
			setError("cameraUnavailable");
		};
		setReady(false);
		setError(undefined);
		setZoom(undefined);
		setZoomValue(undefined);
		setZoomBusy(false);
		const last = previous.current;
		const requestedFacing = requested && "facing" in requested ? requested.facing : undefined;
		const requestedDevice = requested && "deviceId" in requested ? requested.deviceId : undefined;
		const flipping = Boolean(requestedFacing && requestedFacing !== last?.facing);
		const changingDevice = Boolean(requestedDevice && requestedDevice !== last?.deviceId);
		async function start() {
			try {
				// Current macOS app has no camera purpose string/entitlement; do not trigger a native TCC request.
				if (!element || isMacDesktopShell() || !navigator.mediaDevices?.getUserMedia)
					throw new Error("camera_unavailable");
				stream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: requestedDevice
						? { deviceId: { exact: requestedDevice } }
						: { facingMode: requestedFacing ? { exact: requestedFacing } : CAMERA_FALLBACK },
				});
				if (removed) {
					for (const part of stream.getTracks()) part.stop();
					return;
				}
				camera = stream.getVideoTracks()[0];
				if (!camera) throw new Error("camera_unavailable");
				const settings = camera.getSettings() as MediaTrackSettings & { zoom?: number };
				if (
					(flipping &&
						((settings.facingMode && settings.facingMode !== requestedFacing) ||
							(settings.deviceId && settings.deviceId === last?.deviceId))) ||
					(changingDevice && settings.deviceId && settings.deviceId !== requestedDevice)
				) {
					throw new Error("camera_switch_unverified");
				}
				track.current = camera;
				camera.addEventListener("ended", ended);
				const capabilities = camera.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: Zoom }) | undefined;
				if (capabilities?.zoom && capabilities.zoom.max > capabilities.zoom.min) {
					setZoom(capabilities.zoom);
					setZoomValue(settings.zoom);
				}
				element.srcObject = stream;
				await element.play();
				if (removed) return;
				const facing = settings.facingMode;
				previous.current = {
					facing: facing === "user" || facing === "environment" ? facing : (requestedFacing ?? "environment"),
					deviceId: settings.deviceId,
				};
				setReady(true);
				const inputs = await navigator.mediaDevices.enumerateDevices?.().catch(() => []);
				if (!removed) {
					const candidates =
						inputs?.filter((item) => item.kind === "videoinput" && item.deviceId).map((item) => item.deviceId) ?? [];
					setDeviceIds(candidates);
					setCanSwitch(
						mobile
							? flipping ||
									(capabilities?.facingMode?.length ?? 0) > 1 ||
									candidates.length > 1 ||
									(navigator.maxTouchPoints > 0 && Boolean(facing))
							: candidates.length > 1,
					);
				}
			} catch (cause) {
				if (removed) return;
				for (const part of stream?.getTracks() ?? []) part.stop();
				stream = undefined;
				if ((flipping || changingDevice) && last) {
					setRequested(changingDevice && last.deviceId ? { deviceId: last.deviceId } : { facing: last.facing });
					return;
				}
				setReady(false);
				setError(
					cause instanceof DOMException && cause.name === "NotAllowedError" ? "cameraPermission" : "cameraUnavailable",
				);
			}
		}
		void start();
		return () => {
			removed = true;
			active.current = false;
			camera?.removeEventListener("ended", ended);
			for (const part of stream?.getTracks() ?? []) part.stop();
			if (element) element.srcObject = null;
			track.current = null;
		};
	}, [requested, mobile]);

	function switchCamera() {
		if (mobile) {
			setReady(false);
			setRequested({ facing: previous.current?.facing === "user" ? "environment" : "user" });
			return;
		}
		const current = previous.current?.deviceId;
		const next = current ? deviceIds[(deviceIds.indexOf(current) + 1) % deviceIds.length] : deviceIds[0];
		if (next && next !== current) {
			setReady(false);
			setRequested({ deviceId: next });
		}
	}

	async function changeZoom(value: number) {
		const camera = track.current;
		if (!camera || zoomBusy) return;
		setZoomBusy(true);
		try {
			await camera.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
			if (track.current === camera) setZoomValue((camera.getSettings() as MediaTrackSettings & { zoom?: number }).zoom);
		} catch {
			if (track.current === camera) setZoom(undefined);
		} finally {
			if (track.current === camera) setZoomBusy(false);
		}
	}

	async function capture() {
		const element = video.current;
		if (saving || photoLimitReached || !element || !element.videoWidth || !element.videoHeight) return;
		const time = elapsedMs;
		setSaving(true);
		setError(undefined);
		try {
			const canvas = document.createElement("canvas");
			const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(element.videoWidth, element.videoHeight));
			canvas.width = Math.max(1, Math.round(element.videoWidth * scale));
			canvas.height = Math.max(1, Math.round(element.videoHeight * scale));
			const context = canvas.getContext("2d");
			if (!context) throw new Error("camera_canvas_unavailable");
			context.drawImage(element, 0, 0, canvas.width, canvas.height);
			setFlash((count) => count + 1);
			const image = new Promise<Blob>((resolve, reject) =>
				canvas.toBlob(
					(blob) => {
						if (blob?.size) resolve(blob);
						else reject(new Error("camera_image_unavailable"));
					},
					"image/jpeg",
					0.88,
				),
			);
			await onPhoto(image, time);
			if (active.current) setAnimatePhoto(true);
		} catch {
			if (active.current) setError("photoFailed");
		} finally {
			if (active.current) setSaving(false);
		}
	}

	return (
		<section className="meeting-camera" data-theme="dark" aria-label={t("meetingRecorder.camera")}>
			<video ref={video} autoPlay muted playsInline aria-label={t("meetingRecorder.camera")} />
			{flash ? <span key={flash} className="meeting-camera-flash" aria-hidden="true" /> : null}
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
				<output aria-live="off" className="meeting-camera-recording" aria-label={t("meetingRecorder.elapsed")}>
					<span aria-hidden="true" data-paused={paused} />
					{t("meetingRecorder.cardSeconds", { seconds: Math.floor(elapsedMs / 1000) })}
					<span className="sr-only">{t(paused ? "meetingRecorder.paused" : "meetingRecorder.recording")}</span>
				</output>
				{onTogglePause ? (
					<button
						type="button"
						className="meeting-camera-control meeting-camera-pause"
						disabled={pauseBusy}
						aria-label={t(paused ? "meetingRecorder.resume" : "meetingRecorder.pause")}
						onClick={() => void onTogglePause()}
					>
						{paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
					</button>
				) : (
					<span />
				)}
			</header>
			{error ? (
				<p role="status">{t(`meetingRecorder.${error}`)}</p>
			) : !ready ? (
				<p role="status">{t("app.loading")}</p>
			) : null}
			<footer>
				{ready && presets.length > 1 ? (
					<fieldset className="meeting-camera-zoom" aria-label={t("meetingRecorder.cameraZoom")}>
						{presets.map((value) => (
							<button
								type="button"
								key={value}
								disabled={zoomBusy || saving}
								aria-pressed={zoomValue === value}
								onClick={() => void changeZoom(value)}
							>
								{value}×
							</button>
						))}
					</fieldset>
				) : null}
				<div className="meeting-camera-actions">
					{latest ? (
						<button
							ref={thumbnail}
							type="button"
							className="meeting-camera-thumbnail"
							aria-label={t("meetingRecorder.photosOnDevice")}
							onClick={() => setGallery(latest.id)}
						>
							<CameraThumbnail key={latest.id} image={latest.image} animate={animatePhoto} />
						</button>
					) : (
						<span />
					)}
					<button
						type="button"
						className="meeting-camera-shutter"
						disabled={!ready || saving || photoLimitReached}
						aria-label={t("meetingRecorder.cameraCapture")}
						onClick={() => void capture()}
					>
						<Camera size={23} aria-hidden="true" />
					</button>
					{canSwitch ? (
						<button
							type="button"
							className="meeting-camera-control"
							disabled={!ready || saving || zoomBusy}
							aria-label={t("meetingRecorder.cameraSwitch")}
							onClick={switchCamera}
						>
							<SwitchCamera size={21} aria-hidden="true" />
						</button>
					) : null}
				</div>
			</footer>
			{gallery ? (
				<MeetingPhotoGallery
					photos={photos}
					initialPhotoId={gallery}
					onClose={() => {
						setGallery(undefined);
						requestAnimationFrame(() => thumbnail.current?.focus({ preventScroll: true }));
					}}
				/>
			) : null}
		</section>
	);
}

function CameraThumbnail({ image, animate }: { image: Blob; animate: boolean }) {
	const url = useObjectUrl(image);
	return url ? <img data-new={animate} src={url} alt="" /> : null;
}
