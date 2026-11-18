import { BotForm } from "@yonder/feature-members";

/**
 * 「+」→「新建 Bot」: the same form 「Bot 详情」uses, in create mode (15 第四节). The form itself
 * lives in `@yonder/feature-members` so both entries and every screen share one implementation.
 */
export function CreateBot({ onCreated }: { onCreated: (id: string) => void }) {
	return <BotForm mode="create" onCreated={onCreated} />;
}
