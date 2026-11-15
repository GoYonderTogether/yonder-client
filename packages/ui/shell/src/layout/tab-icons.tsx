import { Brain, ListChecks, MessageCircle } from "lucide-react";
import type { TabId } from "../navigation/routes.ts";

/** One icon per tab, shared by the mobile dock and the desktop rail. */
export const TAB_ICONS: Record<TabId, typeof Brain> = {
	messages: MessageCircle,
	tasks: ListChecks,
	memory: Brain,
};
