import { Camera, SwitchCamera, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { isMacDesktopShell } from "../lib/platform.ts";

const MAX_PHOTO_EDGE = 1920;
const CAMERA_FALLBACK = { ideal: "environment" };
type Zoom = { min: number; max: number; step?: number };

export function MeetingCamera({
	elapsedMs,
	onClose,
	onPhoto,
}: {
	elapsedMs: number;
	onClose: () => void;
	onPhoto: (image: Promise<Blob>, elapsedMs: number) => Promise<void>;
}) {
	const { t } = useTranslation();
	const video = useRef<HTMLVideoElement>(null);
	const close = useRef<HTMLButtonElement>(null);
	useLayoutEffect(() => close.current?.focus(), []);
	const track = useRef<MediaStreamTrack | null>(null);
	const active = useRef(true);
	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [deviceId, setDeviceId] = useState<string>();
	const [error, setError] = useState<"cameraUnavailable" | "cameraPermission" | "photoFailed">();
	const [ready, setReady] = useState(false);
	const [saving, setSaving] = useState(false);
	const [zoom, setZoom] = useState<Zoom>();
	const [zoomValue, setZoomValue] = useState(1);

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
		async function start() {
			try {
				// Current macOS app has no camera purpose string/entitlement; do not trigger a native TCC request.
				if (!element || isMacDesktopShell() || !navigator.mediaDevices?.getUserMedia)
					throw new Error("camera_unavailable");
				stream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: CAMERA_FALLBACK },
				});
				if (removed) {
					for (const part of stream.getTracks()) part.stop();
					return;
				}
				camera = stream.getVideoTracks()[0];
				if (!camera) throw new Error("camera_unavailable");
				track.current = camera;
				camera.addEventListener("ended", ended);
				const capabilities = camera.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: Zoom }) | undefined;
				const settings = camera.getSettings() as MediaTrackSettings & { zoom?: number };
				if (capabilities?.zoom && capabilities.zoom.max > capabilities.zoom.min) {
					setZoom(capabilities.zoom);
					setZoomValue(settings.zoom ?? capabilities.zoom.min);
				}
				element.srcObject = stream;
				await element.play();
				if (removed) return;
				setReady(true);
				try {
					const list = await navigator.mediaDevices.enumerateDevices();
					if (!removed) setDevices(list.filter((item) => item.kind === "videoinput" && item.deviceId));
				} catch {
					// The existing camera still works; there is no reliable switch control.
				}
			} catch (cause) {
				if (removed) return;
				for (const part of stream?.getTracks() ?? []) part.stop();
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
	}, [deviceId]);

	function switchCamera() {
		const current = track.current?.getSettings().deviceId ?? deviceId;
		const next = devices[(devices.findIndex((item) => item.deviceId === current) + 1) % devices.length];
		if (next && next.deviceId !== current) setDeviceId(next.deviceId);
	}

	async function changeZoom(value: number) {
		const camera = track.current;
		if (!camera) return;
		setZoomValue(value);
		try {
			await camera.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
		} catch {
			if (track.current === camera) setZoom(undefined);
		}
	}

	async function capture() {
		const element = video.current;
		if (saving || !element || !element.videoWidth || !element.videoHeight) return;
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
			if (active.current) onClose();
		} catch {
			if (active.current) setError("photoFailed");
		} finally {
			if (active.current) setSaving(false);
		}
	}

	return (
		<section className="meeting-camera" data-theme="dark" aria-label={t("meetingRecorder.camera")}>
			<video ref={video} autoPlay muted playsInline aria-label={t("meetingRecorder.camera")} />
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
			</header>
			{error ? (
				<p role="status">{t(`meetingRecorder.${error}`)}</p>
			) : !ready ? (
				<p role="status">{t("app.loading")}</p>
			) : null}
			<footer>
				{ready && zoom ? (
					<input
						type="range"
						min={zoom.min}
						max={zoom.max}
						step={zoom.step || "any"}
						value={zoomValue}
						aria-label={t("meetingRecorder.cameraZoom")}
						onChange={(event) => void changeZoom(event.currentTarget.valueAsNumber)}
					/>
				) : null}
				<div className="meeting-camera-actions">
					<span />
					<button
						type="button"
						className="meeting-camera-shutter"
						disabled={!ready || saving}
						aria-label={t("meetingRecorder.cameraCapture")}
						onClick={() => void capture()}
					>
						<Camera size={23} aria-hidden="true" />
					</button>
					{ready && devices.length > 1 ? (
						<button
							type="button"
							className="meeting-camera-control"
							disabled={saving}
							aria-label={t("meetingRecorder.cameraSwitch")}
							onClick={switchCamera}
						>
							<SwitchCamera size={21} aria-hidden="true" />
						</button>
					) : null}
				</div>
			</footer>
		</section>
	);
}
