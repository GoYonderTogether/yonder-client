import { Overlay, useLayoutMode } from "@yonder/ui-shell";
import { type ReactNode, useRef } from "react";
import { useTranslation } from "react-i18next";
import { isTauri } from "../lib/keychain.ts";

export function CommerceDialog({
	open,
	onClose,
	title,
	children,
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
}) {
	const { t } = useTranslation();
	const root = useRef(document.documentElement);
	const mode = useLayoutMode(root, undefined, isTauri());
	return (
		<Overlay
			open={open}
			onClose={onClose}
			title={title}
			mode={mode}
			mobilePresentation="sheet"
			closeLabel={t("app.close")}
		>
			<div className="flex flex-col gap-[var(--spacing-4)] p-[var(--spacing-5)]">{children}</div>
		</Overlay>
	);
}
