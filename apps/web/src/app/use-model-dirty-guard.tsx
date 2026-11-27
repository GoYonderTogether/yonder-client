import { DiscardChangesDialog, type LayoutMode, ShellProvider } from "@yonder/ui-shell";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type BlockerFunction, useBlocker } from "react-router";

/**
 * One router blocker for settings editors and browser Back from the phone detail.
 */
export function useModelDirtyGuard(
	mode: LayoutMode,
	desktop: boolean,
	detail: {
		dirty: () => boolean;
		blocksPop: (next: unknown) => boolean;
	},
) {
	const { t } = useTranslation();
	const modelDirty = useRef(false);
	const botDirty = useRef(false);
	const setBotDirty = useCallback((dirty: boolean) => {
		botDirty.current = dirty;
	}, []);
	const current = useRef(detail);
	current.current = detail;
	const isDirty = useCallback(() => modelDirty.current || botDirty.current || current.current.dirty(), []);
	const block = useCallback<BlockerFunction>(
		({ historyAction, nextLocation }) =>
			modelDirty.current ||
			botDirty.current ||
			(historyAction === "POP" && current.current.blocksPop(nextLocation.state)),
		[],
	);
	const blocker = useBlocker(block);
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
				body={t(
					botDirty.current || (blocker.state === "blocked" && detail.blocksPop(blocker.location.state))
						? "bots.discardChanges"
						: "models.discard",
				)}
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
