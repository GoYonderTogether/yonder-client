import { createContext, useContext } from "react";
import type { SidePage } from "./side-layers.tsx";

/**
 * Lets a page put its own page in the frame's right-hand side panel (a memory file's history, 24
 * 第四节). `open` replaces what the panel shows; `push` stacks on it, and back returns. The page's
 * content fetches its own data, so what is shown stays current while it is open.
 */
export interface SidePanelControls {
	open: (page: SidePage) => void;
	push: (page: SidePage) => void;
	close: () => void;
}

const SidePanelContext = createContext<SidePanelControls | null>(null);

export const SidePanelProvider = SidePanelContext.Provider;

export function useSidePanel(): SidePanelControls {
	const controls = useContext(SidePanelContext);
	if (!controls) throw new Error("useSidePanel needs the frame's SidePanelProvider");
	return controls;
}
