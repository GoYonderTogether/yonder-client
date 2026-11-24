import type { Member } from "@yonder/protocol";
import { Avatar, UnreadBadge as CountBadge } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";

export function BotTabAvatar({
	bot,
	unreadCount,
	muted,
}: {
	bot: Member | undefined;
	unreadCount: number | undefined;
	muted?: boolean | undefined;
}) {
	return (
		<span className="relative">
			<Avatar name={bot?.displayName ?? ""} src={bot?.avatarUrl} color={bot?.avatarColor} kind="bot" size={24} />
			<span className="absolute -top-[var(--spacing-1)] -end-[var(--spacing-2)]">
				<UnreadBadge count={unreadCount} dot={Boolean(muted)} />
			</span>
		</span>
	);
}

export function UnreadBadge({
	count = 0,
	dot = false,
	muted = false,
}: {
	count?: number | undefined;
	dot?: boolean;
	muted?: boolean | undefined;
}) {
	const { t } = useTranslation();
	return <CountBadge count={count} dot={dot} muted={muted} label={t("messages.unread", { count })} />;
}
