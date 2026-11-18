import { FeishuChannel } from "@yonder/feature-me";
import { BotDetail } from "@yonder/feature-members";
import { useContacts, usePerson } from "@yonder/ui-data";
import type { LayoutMode } from "@yonder/ui-shell";
import { Overlay } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";

/**
 * 「Bot 详情」as a layer: a centred dialog on a wide desktop, a full page on a phone — the same
 * `Overlay` both entries use (15 第四节). Only a Bot this account owns can be opened here; other
 * members' pages are the members package's job.
 */
export function BotDetailOverlay({
	memberId,
	mode,
	onClose,
	onDeleted,
}: {
	memberId: string | null;
	mode: LayoutMode;
	onClose: () => void;
	onDeleted: (conversationId: string | undefined) => void;
}) {
	const { t } = useTranslation();
	const person = usePerson();
	const contacts = useContacts();
	const member = memberId && person ? contacts.data?.items.find((item) => item.id === memberId) : undefined;
	if (!memberId || !person || !member || member.kind !== "bot" || member.ownerId !== person.id) return null;
	return (
		<Overlay
			open
			onClose={onClose}
			title={member.displayName}
			mode={mode}
			mobileBackLabel={t("app.back")}
			closeLabel={t("app.close")}
		>
			<BotDetail bot={member} onDeleted={onDeleted} />
			<FeishuChannel key={member.id} botId={member.id} />
		</Overlay>
	);
}
