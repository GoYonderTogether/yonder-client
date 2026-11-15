import { useEffect, useState } from "react";
import { createVideoPoster } from "./video-poster.ts";

export function useVideoPoster(blob: Blob | undefined) {
	const [poster, setPoster] = useState<Blob>();
	useEffect(() => {
		setPoster(undefined);
		if (!blob) return;
		const controller = new AbortController();
		void createVideoPoster(blob, controller.signal)
			.then((value) => {
				if (!controller.signal.aborted) setPoster(value);
			})
			.catch(() => {}); // The card keeps its video icon when the device cannot decode a frame.
		return () => controller.abort();
	}, [blob]);
	return poster;
}
