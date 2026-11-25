import { Overlay, ShellProvider } from "@yonder/ui-shell";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ConversationPage } from "../pages/conversation-page.tsx";
import type { useTaskPreset } from "./use-task-preset.ts";

export function BotPresetOverlay({
	preset,
	title,
	conversationId,
	disconnected,
	status,
	children,
}: {
	preset: Pick<ReturnType<typeof useTaskPreset>, "drawerOpen" | "closeDrawer" | "expandDrawer">;
	title: string;
	conversationId: string | null;
	disconnected: boolean;
	status?: ReactNode;
	children: ReactNode;
}) {
	const { t } = useTranslation();
	return (
		<Overlay
			open={preset.drawerOpen}
			onClose={preset.closeDrawer}
			title={title || t("nav.messages")}
			closeLabel={t("app.close")}
			mode="mobile"
			mobilePresentation="tall-sheet"
			onExpand={preset.expandDrawer}
			expandLabel={t("tasks.expandBotConversation")}
		>
			<ShellProvider value={{ mode: "mobile", left: null, meOpen: false }}>
				{/* The sheet has no title bar of its own: the chat's floating header is its Bot identity,
				    which the preview carries into the full conversation when the sheet expands. */}
				<ConversationPage
					conversationId={conversationId}
					disconnected={disconnected}
					mainBotHome
					readActive={preset.drawerOpen}
				/>
			</ShellProvider>
			<div data-preset-composer className="shrink-0 px-[var(--spacing-3)] pb-[var(--spacing-2)] pt-[var(--spacing-1)]">
				<div className="pb-[var(--spacing-2)] empty:hidden">{status}</div>
				{children}
			</div>
		</Overlay>
	);
}
