/** Decode only an already-local Blob. A poster never fetches the original from the network. */
export function createVideoPoster(blob: Blob, signal?: AbortSignal): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const video = document.createElement("video");
		const canvas = document.createElement("canvas");
		const address = URL.createObjectURL(blob);
		let finished = false;
		const finish = (error?: Error, poster?: Blob) => {
			if (finished) return;
			finished = true;
			clearTimeout(timeout);
			signal?.removeEventListener("abort", abort);
			video.onloadeddata = null;
			video.onerror = null;
			video.pause();
			video.removeAttribute("src");
			video.load();
			URL.revokeObjectURL(address);
			canvas.width = canvas.height = 1;
			if (poster) resolve(poster);
			else reject(error ?? new Error("video_poster_unavailable"));
		};
		const abort = () => finish(new DOMException("Aborted", "AbortError"));
		const timeout = setTimeout(() => finish(new Error("video_poster_timeout")), 8_000);
		video.preload = "auto";
		video.muted = true;
		video.playsInline = true;
		video.onerror = () => finish(new Error("video_poster_unsupported"));
		video.onloadeddata = () => {
			try {
				if (!video.videoWidth || !video.videoHeight) throw new Error("video_poster_no_frame");
				const scale = Math.min(1, 320 / video.videoWidth, 320 / video.videoHeight);
				canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
				canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
				const context = canvas.getContext("2d");
				if (!context) throw new Error("video_poster_no_canvas");
				context.drawImage(video, 0, 0, canvas.width, canvas.height);
				canvas.toBlob((poster) => finish(undefined, poster ?? undefined), "image/jpeg", 0.75);
			} catch (error) {
				finish(error instanceof Error ? error : new Error("video_poster_unavailable"));
			}
		};
		if (signal?.aborted) abort();
		else {
			signal?.addEventListener("abort", abort, { once: true });
			video.src = address;
		}
	});
}
