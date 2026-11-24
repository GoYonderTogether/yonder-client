import { IconButton } from "@yonder/ui-components";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * 「+」 asks the main Bot (2026-11-24, Meta Muse as the reference): creating is telling the Bot, so
 * the button is one control, not a menu. On 「目标」 it starts a goal sentence, on 「事项」 an item
 * sentence; the owner finishes it in the main Bot's draft.
 */
export function TaskActions({
	scheduled,
	onAddItem,
	onAddGoal,
}: {
	scheduled: boolean;
	onAddItem: () => void;
	onAddGoal: () => void;
}) {
	const { t } = useTranslation();
	return (
		<IconButton size="md" aria-label={t("tasks.create")} onClick={scheduled ? onAddGoal : onAddItem}>
			<Plus size={20} aria-hidden="true" />
		</IconButton>
	);
}
