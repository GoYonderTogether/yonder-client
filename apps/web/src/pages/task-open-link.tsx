import { SidePageActions, useShellChrome } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/** Continues the work in the main area; in a detail pane it sits with the page's other actions. */
export function FullTaskLink({ id }: { id: string }) {
	const { t } = useTranslation();
	const shell = useShellChrome();
	return (
		<SidePageActions>
			<Link
				to={`/tasks/${encodeURIComponent(id)}`}
				replace={!shell.desktop}
				className="inline-flex min-h-[var(--control-sm)] items-center rounded-[var(--radius-control-sm)] px-[var(--spacing-2)] text-caption font-medium text-[var(--color-accent-text)] hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
			>
				{t("tasks.openFullItem")}
			</Link>
		</SidePageActions>
	);
}
