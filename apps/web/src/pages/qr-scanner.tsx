import { Button } from "@yonder/ui-components";
import { Camera, ImagePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiBaseUrl } from "../lib/config.ts";
import { isTauri } from "../lib/keychain.ts";
import { loadQrDecoder } from "../lib/qr-decoder.ts";
import { qrTarget } from "../lib/qr-target.ts";

/** Camera frames and selected photos stay on-device. */
export function QrScanner({ onResult }: { onResult: (value: string) => void }) {
	const { t } = useTranslation();
	const video = useRef<HTMLVideoElement>(null);
	const file = useRef<HTMLInputElement>(null);
	const mounted = useRef(true);
	const result = useRef(onResult);
	result.current = onResult;
	const [error, setError] = useState<string | null>(null);
	const [cameraRequest, setCameraRequest] = useState<MediaStreamConstraints>({
		video: { facingMode: { ideal: "environment" } },
		audio: false,
	});
	const origin = apiBaseUrl({ shell: isTauri(), dev: import.meta.env.DEV }) || window.location.origin;
	const accept = useCallback(
		(value: string) => {
			if (!mounted.current) return false;
			const target = qrTarget(value, origin);
			if (!target) {
				setError("chatActions.scanInvalid");
				return false;
			}
			result.current(target);
			return true;
		},
		[origin],
	);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		let stream: MediaStream | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const stop = () =>
			stream?.getTracks().forEach((track) => {
				track.stop();
			});
		async function start() {
			try {
				const media = await navigator.mediaDevices.getUserMedia(cameraRequest);
				stream = media;
				if (cancelled) return stop();
				const player = video.current;
				if (!player) return stop();
				player.srcObject = media;
				await player.play();
				const decode = await loadQrDecoder();
				if (cancelled) return stop();
				const canvas = document.createElement("canvas");
				const context = canvas.getContext("2d", { willReadFrequently: true });
				if (!context) throw new Error("canvas unavailable");
				const scan = () => {
					if (cancelled) return;
					if (player.readyState >= 2 && player.videoWidth > 0) {
						const scale = Math.min(1, 640 / player.videoWidth);
						canvas.width = Math.round(player.videoWidth * scale);
						canvas.height = Math.round(player.videoHeight * scale);
						context.drawImage(player, 0, 0, canvas.width, canvas.height);
						const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
						const code = decode(pixels.data, pixels.width, pixels.height);
						if (code && accept(code.data)) return stop();
					}
					timer = setTimeout(scan, 200);
				};
				scan();
			} catch {
				stop();
				if (!cancelled) setError("chatActions.cameraUnavailable");
			}
		}
		setError(null);
		void start();
		return () => {
			cancelled = true;
			clearTimeout(timer);
			stop();
			if (video.current) video.current.srcObject = null;
		};
	}, [accept, cameraRequest]);

	async function readPhoto(photo: File) {
		const url = URL.createObjectURL(photo);
		try {
			const image = new Image();
			image.src = url;
			await image.decode();
			if (!mounted.current) return;
			const decode = await loadQrDecoder();
			if (!mounted.current) return;
			const canvas = document.createElement("canvas");
			const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
			canvas.width = Math.round(image.naturalWidth * scale);
			canvas.height = Math.round(image.naturalHeight * scale);
			const context = canvas.getContext("2d");
			if (!context) throw new Error("canvas unavailable");
			context.drawImage(image, 0, 0, canvas.width, canvas.height);
			const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
			const code = decode(pixels.data, pixels.width, pixels.height);
			if (code) accept(code.data);
			else setError("chatActions.scanInvalid");
		} catch {
			setError("chatActions.scanInvalid");
		} finally {
			URL.revokeObjectURL(url);
			if (file.current) file.current.value = "";
		}
	}

	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			<video
				ref={video}
				muted
				playsInline
				aria-label={t("chatActions.scanCamera")}
				className="aspect-square w-full rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)] object-cover"
			/>
			<p role={error ? "alert" : "status"} className="text-caption text-[var(--color-text-secondary)]">
				{t(error ?? "chatActions.scanReady")}
			</p>
			<div className="flex gap-[var(--spacing-2)]">
				<Button onClick={() => setCameraRequest({ ...cameraRequest })}>
					<Camera size={16} />
					{t("chatActions.scanRetry")}
				</Button>
				<Button onClick={() => file.current?.click()}>
					<ImagePlus size={16} />
					{t("chatActions.scanPhoto")}
				</Button>
			</div>
			<input
				ref={file}
				type="file"
				accept="image/*"
				className="sr-only"
				aria-label={t("chatActions.scanPhoto")}
				onChange={(event) => {
					const photo = event.target.files?.[0];
					if (photo) void readPhoto(photo);
				}}
			/>
		</div>
	);
}
