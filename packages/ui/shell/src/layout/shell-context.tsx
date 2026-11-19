import type { ReactNode, RefObject } from "react";
import { createContext, useContext } from "react";
import type { LayoutMode } from "../responsive/layout-mode.ts";

/** The shell owns the leading control, while each page supplies its center and right slots. */
export interface ShellChrome {
	mode: LayoutMode;
	desktop?: boolean;
	left: ReactNode;
	meOpen: boolean;
	scroll?: { key: string; positions: RefObject<Record<string, number>> };
}

const ShellContext = createContext<ShellChrome>({ mode: "wide", left: null, meOpen: false });

export const ShellProvider = ShellContext.Provider;

export function useShellChrome(): ShellChrome {
	return useContext(ShellContext);
}
