import { Button, ListGroup } from "@yonder/ui-components";
import { useUsage } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";
import { QuotaNumber } from "./quota-number.tsx";

export function QuotaUsage() {
	const { t, i18n } = useTranslation();
	const usage = useUsage();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const items = usage.data?.pages.flatMap((page) => page.items) ?? [];
	const amount = (value: number | null) =>
		value === null ? t("me.quota.unknownUsage") : new Intl.NumberFormat(locale).format(value);
	return (
		<>
			<ListGroup title={t("me.quota.calls")}>
				{items.map((entry) => (
					<li
						key={entry.id}
						className="flex items-start justify-between gap-[var(--spacing-3)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] last:border-0"
					>
						<div className="min-w-0 text-caption text-[var(--color-text-secondary)]">
							<p className="break-words text-body text-[var(--color-text-primary)]">
								{entry.provider} · {entry.model}
								{!entry.ok ? ` · ${t("me.quota.callFailed")}` : ""}
							</p>
							<time dateTime={entry.at}>
								{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
									new Date(entry.at),
								)}
							</time>
							<p>
								{t("me.quota.callTokens", { input: amount(entry.inputTokens), output: amount(entry.outputTokens) })}
							</p>
							<p>
								{t("me.quota.callCache", {
									write: amount(entry.cacheWriteTokens),
									read: amount(entry.cacheReadTokens),
								})}
							</p>
						</div>
						<span className="shrink-0 text-body">
							{entry.usageKnown ? (
								<QuotaNumber value={-entry.cost} locale={locale} signed />
							) : (
								t("me.quota.unknownUsage")
							)}
						</span>
					</li>
				))}
				{usage.isLoading ? <li className="p-[var(--spacing-4)] text-caption">{t("app.loading")}</li> : null}
				{usage.isError ? (
					<li className="px-[var(--spacing-4)]">
						<Button variant="link" onClick={() => void usage.refetch()}>
							{t("app.retry")}
						</Button>
					</li>
				) : null}
				{!usage.isLoading && !usage.isError && !items.length ? (
					<li className="p-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">
						{t("me.quota.callsEmpty")}
					</li>
				) : null}
			</ListGroup>
			{usage.hasNextPage ? (
				<Button onClick={() => void usage.fetchNextPage()} loading={usage.isFetchingNextPage}>
					{t("me.quota.more")}
				</Button>
			) : null}
		</>
	);
}
