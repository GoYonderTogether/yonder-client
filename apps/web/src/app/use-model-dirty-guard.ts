import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useBlocker } from "react-router";

/**
 * Unsaved model settings: leaving the route asks first, and closing the window warns. The ref is
 * set by the model page as its form becomes dirty or clean.
 */
export function useModelDirtyGuard() {
	const { t } = useTranslation();
	const modelDirty = useRef(false);
	const blocker = useBlocker(() => modelDirty.current);
	useEffect(() => {
		if (blocker.state !== "blocked") return;
		if (window.confirm(t("models.discard"))) {
			modelDirty.current = false;
			blocker.proceed();
		} else blocker.reset();
	}, [blocker, t]);
	useEffect(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (modelDirty.current) event.preventDefault();
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, []);
	return modelDirty;
}
