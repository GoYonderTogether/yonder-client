import { Overlay, ShellProvider } from "@yonder/ui-shell";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ConversationPage } from "../pages/messages-page.tsx";

export function TaskBotDrawer({
	open,
	onClose,
	title,
	conversationId,
	disconnected,
	status,
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	conversationId: string | null;
	disconnected: boolean;
	status?: ReactNode;
	children: ReactNode;
}) {
	const { t } = useTranslation();
	return (
		<Overlay
			open={open}
			onClose={onClose}
			title={title || t("nav.messages")}
			closeLabel={t("app.close")}
			mode="mobile"
			mobilePresentation="tall-sheet"
		>
			<ShellProvider value={{ mode: "mobile", left: null, meOpen: false }}>
				<ConversationPage conversationId={conversationId} disconnected={disconnected} embedded readActive={open} />
			</ShellProvider>
			<div className="shrink-0 px-[var(--spacing-3)] pb-[var(--spacing-2)] pt-[var(--spacing-1)]">
				<div className="pb-[var(--spacing-2)] empty:hidden">{status}</div>
				{children}
			</div>
		</Overlay>
	);
}
