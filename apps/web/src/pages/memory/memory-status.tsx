import { Button } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";

/** A failed read or write, with the server's own reason (22: real errors, never a softened line). */
export function MemoryError({ error, retry, title }: { error: Error; retry?: () => void; title?: string }) {
	const { t } = useTranslation();
	return (
		<div
			role="alert"
			className="flex flex-col items-start gap-[var(--spacing-2)] rounded-[var(--radius-lg)] bg-[var(--color-danger-subtle)] p-[var(--spacing-4)] text-caption text-[var(--color-danger)]"
		>
			{title ? <p className="font-medium">{title}</p> : null}
			<p className="wrap-anywhere">{error.message}</p>
			{retry ? (
				<Button size="sm" variant="secondary" onClick={retry}>
					{t("app.retry")}
				</Button>
			) : null}
		</div>
	);
}

export function MemoryLoading() {
	const { t } = useTranslation();
	return (
		<p role="status" className="p-[var(--spacing-5)] text-caption text-[var(--color-text-tertiary)]">
			{t("app.loading")}
		</p>
	);
}
