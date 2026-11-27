import { UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { type MessageMenuTarget, mentionMenuItem } from "./message-menu.tsx";
import { useLongPress } from "./use-long-press.ts";

export function SenderAvatar({
	name,
	face,
	sender,
	onOpen,
	onMention,
	onMenu,
}: {
	name: string;
	face: ReactNode;
	sender?: ReactNode;
	onOpen: () => void;
	onMention?: (() => void) | undefined;
	onMenu: (target: MessageMenuTarget) => void;
}) {
	const { t } = useTranslation();
	const { handlers, pressed } = useLongPress((point) => {
		const items = [
			{ id: "profile" as const, label: t("chat.viewProfile"), icon: <UserRound size={16} />, run: onOpen },
		];
		onMenu({ ...point, items: onMention ? [...items, mentionMenuItem(t("chat.mentionTa"), onMention)] : items });
	});
	return (
		<button
			type="button"
			data-message-avatar-button
			data-long-press={pressed || undefined}
			aria-label={t("members.openOwner", { name })}
			aria-haspopup="menu"
			className={`m-0 inline-flex min-w-0 max-w-full select-none border-0 text-start [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${sender ? "message-run-profile rounded-[var(--radius-control-sm)]" : "rounded-[var(--radius-full)] p-0"} ${pressed ? "bg-[var(--color-bg-hover)] shadow-[0_0_0_var(--spacing-1)_var(--color-bg-hover)]" : "bg-transparent"}`}
			onClick={onOpen}
			{...handlers}
		>
			{sender ? (
				<>
					<span data-message-sender-avatar className="message-run-profile-avatar">
						{face}
					</span>
					{sender}
				</>
			) : (
				face
			)}
		</button>
	);
}
