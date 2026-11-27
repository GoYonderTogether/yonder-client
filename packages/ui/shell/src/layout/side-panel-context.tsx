import { createContext, useContext } from "react";
import type { SidePage } from "./side-layers.tsx";

/** Opens an independent resource or a child page of the current resource. */
export interface SidePanelControls {
	/** The resource already shown by the workspace route, e.g. `task:<id>` or `memory:<path>`. */
	primaryResource?: string | null;
	open: (page: SidePage) => void;
	push: (page: SidePage) => void;
	openMember?: (handle: string, title?: string, onReturn?: () => void) => void;
	/** Pops the top page if it still matches the supplied key. */
	back: (key?: string) => void;
	/** Closes the owning tab, or the named resource. */
	close: (key?: string) => void;
	/** Editors use this to guard removal of the page containing them. */
	setDirty?: (dirty: boolean) => void;
}

const SidePanelContext = createContext<SidePanelControls | null>(null);

export const SidePanelProvider = SidePanelContext.Provider;

export function useOptionalSidePanel(): SidePanelControls | null {
	return useContext(SidePanelContext);
}

export function useSidePanel(): SidePanelControls {
	const controls = useOptionalSidePanel();
	if (!controls) throw new Error("useSidePanel needs the frame's SidePanelProvider");
	return controls;
}
