import { ListGroup, ListSwitch } from "@yonder/ui-components";
import { useSetConversationMuted } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";

export function ConversationNotificationSettings({ id, muted }: { id: string; muted: boolean }) {
	const { t } = useTranslation();
	const setMuted = useSetConversationMuted(id);
	const checked = setMuted.isPending ? (setMuted.variables ?? muted) : muted;
	return (
		<ListGroup title={t("messages.notificationsSection")}>
			<ListSwitch
				title={t("messages.muted")}
				checked={checked}
				busy={setMuted.isPending}
				onChange={(value) => setMuted.mutate(value)}
				error={setMuted.isError ? t("messages.muteFailed") : undefined}
			/>
		</ListGroup>
	);
}
