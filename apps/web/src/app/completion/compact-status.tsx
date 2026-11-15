import { Button } from "@yonder/ui-components";
import { ApiError, type useCompactConversation } from "@yonder/ui-data";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export function CompactStatus({ command }: { command: ReturnType<typeof useCompactConversation> }) {
	const { t } = useTranslation();
	useEffect(() => {
		if (!command.data) return;
		const timer = window.setTimeout(command.reset, 4000);
		return () => window.clearTimeout(timer);
	}, [command.data, command.reset]);
	if (!command.isPending && !command.isError && !command.data) return null;
	const code = command.error instanceof ApiError ? command.error.code : "";
	const message = command.isPending
		? "skills.compacting"
		: command.isError
			? code === "compact_busy"
				? "skills.compactBusy"
				: code === "compact_unsupported"
					? "skills.compactUnsupported"
					: "skills.compactFailed"
			: command.data?.status === "compacted"
				? "skills.compacted"
				: "skills.compactUnchanged";
	return (
		<div className="absolute bottom-full right-0 z-50 mb-[var(--spacing-2)] flex max-w-full items-center gap-[var(--spacing-2)] rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-bg-raised)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)] shadow-[var(--shadow-lg)]">
			<span role={command.isError ? "alert" : "status"}>{t(message)}</span>
			{command.isError ? (
				<Button variant="link" onClick={command.run}>
					{t("app.retry")}
				</Button>
			) : null}
			{!command.isPending ? (
				<Button variant="link" onClick={command.reset}>
					{t("app.close")}
				</Button>
			) : null}
		</div>
	);
}
