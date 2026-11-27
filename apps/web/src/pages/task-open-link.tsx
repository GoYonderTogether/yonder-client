import { useOptionalSidePanel, useShellChrome } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";
import { DetailLinkAction } from "../lib/detail-link-action.tsx";

/** Continues the work in the main area; in a detail pane it sits with the page's other actions. */
export function FullTaskLink({ id }: { id: string }) {
	const { t } = useTranslation();
	const shell = useShellChrome();
	const side = useOptionalSidePanel();
	return side?.primaryResource === `task:${id}` ? null : (
		<DetailLinkAction
			to={`/tasks/${encodeURIComponent(id)}`}
			replace={!shell.desktop}
			label={t("tasks.openFullItem")}
		/>
	);
}
