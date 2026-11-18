import type { Member } from "@yonder/protocol";
import { Avatar } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";

export function BotTabAvatar({ bot, unreadCount }: { bot: Member | undefined; unreadCount: number | undefined }) {
	return (
		<span className="relative">
			<Avatar name={bot?.displayName ?? ""} src={bot?.avatarUrl} color={bot?.avatarColor} kind="bot" size={24} />
			<span className="absolute -top-[var(--spacing-1)] -end-[var(--spacing-2)]">
				<UnreadBadge count={unreadCount} />
			</span>
		</span>
	);
}

export function UnreadBadge({ count = 0 }: { count?: number | undefined }) {
	const { t } = useTranslation();
	if (!count) return null;
	return (
		<span
			role="img"
			aria-label={t("messages.unread", { count })}
			className="min-w-[var(--spacing-4)] rounded-full bg-[var(--color-danger)] px-[var(--spacing-1)] text-center text-micro font-medium tabular-nums text-[var(--color-danger-inverse)]"
		>
			{count > 99 ? "99+" : count}
		</span>
	);
}
