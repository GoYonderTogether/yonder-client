import { useLayoutEffect, useRef } from "react";

/** One same-URL history entry lets native/browser Back close the reader before its conversation. */
export function usePreviewHistory(onClose: () => void) {
	const close = useRef(onClose);
	const token = useRef(crypto.randomUUID());
	const mounted = useRef(false);
	close.current = onClose;
	useLayoutEffect(() => {
		mounted.current = true;
		if (history.state?.attachmentPreview !== token.current)
			history.pushState({ ...history.state, attachmentPreview: token.current }, "");
		const back = () => {
			if (history.state?.attachmentPreview !== token.current) close.current();
		};
		window.addEventListener("popstate", back);
		return () => {
			mounted.current = false;
			window.removeEventListener("popstate", back);
			queueMicrotask(() => {
				if (!mounted.current && history.state?.attachmentPreview === token.current) history.back();
			});
		};
	}, []);
}
