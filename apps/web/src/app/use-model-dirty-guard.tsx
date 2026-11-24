import { DiscardChangesDialog, type LayoutMode, ShellProvider } from "@yonder/ui-shell";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useBlocker } from "react-router";

/**
 * One router blocker for settings editors, including the same-URL chat Bot drawer pages.
 */
export function useModelDirtyGuard(mode: LayoutMode, desktop: boolean) {
	const { t } = useTranslation();
	const modelDirty = useRef(false);
	const botDirty = useRef(false);
	const setBotDirty = useCallback((dirty: boolean) => {
		botDirty.current = dirty;
	}, []);
	const isDirty = useCallback(() => modelDirty.current || botDirty.current, []);
	const blocker = useBlocker(isDirty);
	useEffect(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (isDirty()) event.preventDefault();
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [isDirty]);
	const dialog = (
		<ShellProvider value={{ mode, desktop, left: null, meOpen: false }}>
			<DiscardChangesDialog
				open={blocker.state === "blocked"}
				body={t(botDirty.current ? "bots.discardChanges" : "models.discard")}
				onCancel={() => blocker.reset?.()}
				onConfirm={() => {
					modelDirty.current = false;
					botDirty.current = false;
					blocker.proceed?.();
				}}
			/>
		</ShellProvider>
	);
	return { modelDirty, setBotDirty, isDirty, dialog };
}
