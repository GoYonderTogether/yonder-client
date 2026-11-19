import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useBlocker } from "react-router";

/**
 * One router blocker for settings editors, including the same-URL chat Bot drawer pages.
 */
export function useModelDirtyGuard() {
	const { t } = useTranslation();
	const modelDirty = useRef(false);
	const botDirty = useRef(false);
	const setBotDirty = useCallback((dirty: boolean) => {
		botDirty.current = dirty;
	}, []);
	const blocker = useBlocker(() => modelDirty.current || botDirty.current);
	useEffect(() => {
		if (blocker.state !== "blocked") return;
		if (window.confirm(t(botDirty.current ? "bots.discardChanges" : "models.discard"))) {
			modelDirty.current = false;
			botDirty.current = false;
			blocker.proceed();
		} else blocker.reset();
	}, [blocker, t]);
	useEffect(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (modelDirty.current || botDirty.current) event.preventDefault();
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, []);
	return { modelDirty, setBotDirty };
}
