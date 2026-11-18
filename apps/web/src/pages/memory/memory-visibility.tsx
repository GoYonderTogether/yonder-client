import type { MemoryVisibility as Visibility } from "@yonder/protocol";
import { Globe, LockKeyhole, ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";

export const VISIBILITY = {
	private: { Icon: LockKeyhole, label: "memory.private" },
	public: { Icon: Globe, label: "memory.public" },
	secret: { Icon: ShieldOff, label: "memory.secret" },
};

export function MemoryVisibility({ visibility }: { visibility: Visibility }) {
	const { t } = useTranslation();
	const item = VISIBILITY[visibility];
	// Existing servers may still return cards without the visibility field.
	if (!item) return null;
	return (
		<span className="memory-visibility">
			<item.Icon aria-hidden />
			{t(item.label)}
		</span>
	);
}
