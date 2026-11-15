import { BookMarked, ListChecks, MessageCircle } from "lucide-react";
import type { TabId } from "../navigation/routes.ts";

/** One icon per tab, shared by the mobile dock and the desktop rail. */
export const TAB_ICONS: Record<TabId, typeof BookMarked> = {
	messages: MessageCircle,
	tasks: ListChecks,
	memory: BookMarked,
};
