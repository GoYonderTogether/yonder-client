import { Button } from "@yonder/ui-components";
import { ApiError } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";

/**
 * The real reason for a failure, in the reader's language (22: real errors, never a softened line).
 * A coded API failure reads its sentence from `errors.*`; a code with no sentence yet, or a failure
 * that never reached the server, shows the message it came with rather than a stand-in.
 */
export function useErrorText() {
	const { t, i18n } = useTranslation();
	return (error: Error): string =>
		error instanceof ApiError && i18n.exists(error.messageKey) ? t(error.messageKey) : error.message;
}

export function MemoryError({ error, retry, title }: { error: Error; retry?: () => void; title?: string }) {
	const { t } = useTranslation();
	const text = useErrorText();
	return (
		<div
			role="alert"
			className="flex flex-col items-start gap-[var(--spacing-2)] rounded-[var(--radius-lg)] bg-[var(--color-danger-subtle)] p-[var(--spacing-4)] text-caption text-[var(--color-danger)]"
		>
			{title ? <p className="font-medium">{title}</p> : null}
			<p className="wrap-anywhere">{text(error)}</p>
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
