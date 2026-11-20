import type { Member } from "@yonder/protocol";
import { Avatar, UnreadBadge as CountBadge } from "@yonder/ui-components";
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
	return <CountBadge count={count} label={t("messages.unread", { count })} />;
}
