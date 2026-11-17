import { PublicLayout } from "@yonder/feature-landing";
import type { QuotaConfigResponse, QuotaPool, RateCardResponse } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { useQuotaConfig, useQuotaRates } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";
import "./pricing-page.css";

const POOL_ORDER: QuotaPool[] = ["main", "background", "coding", "external"];

/** Quota in the reader's units: exact below ten thousand, a compact figure above it. */
function quotaAmount(value: number, locale: string): string {
	return new Intl.NumberFormat(locale, {
		notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
		maximumFractionDigits: 1,
	}).format(value);
}

/** One quota is one millionth of a yuan, so the same number reads as yuan per million tokens. */
function perMillion(value: number, locale: string): string {
	return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value);
}

/**
 * The full price list, reachable signed out the way the legal pages are. Every figure comes from
 * the published catalog and the published rate card — this page holds no number of its own — and
 * no vendor or model id appears on it (额度方案 第十一节).
 */
export function PricingPage() {
	const { t, i18n } = useTranslation();
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const config = useQuotaConfig();
	const rates = useQuotaRates();
	return (
		<PublicLayout homeLink>
			<main className="pricing-main">
				<h1>{t("pricing.title")}</h1>
				{config.isError || rates.isError ? (
					<Button
						variant="link"
						onClick={() => {
							void config.refetch();
							void rates.refetch();
						}}
					>
						{t("pricing.loadFailed")} {t("pricing.retry")}
					</Button>
				) : !config.data || !rates.data ? (
					<p role="status">{t("app.loading")}</p>
				) : (
					<PricingBody config={config.data} rates={rates.data} locale={locale} />
				)}
			</main>
		</PublicLayout>
	);
}

function PricingBody({
	config,
	rates,
	locale,
}: {
	config: QuotaConfigResponse;
	rates: RateCardResponse;
	locale: string;
}) {
	const { t } = useTranslation();
	return (
		<>
			<p className="pricing-lead">{t("pricing.conversion", { quota: quotaAmount(rates.quotaPerYuan, locale) })}</p>

			<section className="pricing-section">
				<h2>{t("pricing.modelTitle")}</h2>
				<p className="pricing-note">{t("pricing.modelNote", { baseline: rates.baseline })}</p>
				<div className="pricing-table">
					<table>
						<caption className="sr-only">{t("pricing.modelTitle")}</caption>
						<thead>
							<tr>
								<th scope="col">{t("pricing.tier")}</th>
								<th scope="col">{t("pricing.input")}</th>
								<th scope="col">{t("pricing.output")}</th>
								<th scope="col">{t("pricing.cacheWrite")}</th>
								<th scope="col">{t("pricing.cacheRead")}</th>
							</tr>
						</thead>
						<tbody>
							{rates.items.map((item) => (
								<tr key={item.name}>
									<th scope="row">
										{item.name}
										<span className="pricing-multiple">
											{t("pricing.multiple", {
												multiple: perMillion(item.multiple, locale),
												baseline: rates.baseline,
											})}
										</span>
									</th>
									<td>{perMillion(item.input, locale)}</td>
									<td>{perMillion(item.output, locale)}</td>
									<td>{perMillion(item.cacheWrite, locale)}</td>
									<td>{perMillion(item.cacheRead, locale)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			<section className="pricing-section">
				<h2>{t("pricing.grantsTitle")}</h2>
				<div className="pricing-pools">
					{POOL_ORDER.map((pool) => (
						<div className="pricing-pool" key={pool}>
							<h3>{t(`me.quota.pools.${pool}`)}</h3>
							<p>{t(`pricing.purpose.${pool}`)}</p>
							<dl>
								<dt>{t("pricing.signup")}</dt>
								<dd>{quotaAmount(config.signup[pool], locale)}</dd>
								<dt>{t("pricing.monthly")}</dt>
								<dd>{quotaAmount(config.monthly[pool], locale)}</dd>
							</dl>
							<p className="pricing-note">{overflowSentence(config, pool, locale, t)}</p>
						</div>
					))}
				</div>
				<p className="pricing-note">{t("pricing.monthlyNote")}</p>
			</section>

			<section className="pricing-section">
				<h2>{t("pricing.inviteTitle")}</h2>
				<p>
					{t("pricing.inviteRule", {
						inviter: quotaAmount(config.invite.inviter, locale),
						invitee: quotaAmount(config.invite.invitee, locale),
						maxInvites: config.invite.maxInvites,
					})}
				</p>
			</section>
		</>
	);
}

/** One pool's overflow rule, in the catalog's own numbers. */
function overflowSentence(
	config: QuotaConfigResponse,
	pool: QuotaPool,
	locale: string,
	t: ReturnType<typeof useTranslation>["t"],
): string {
	const rule = config.rules[pool];
	if (!rule.overflow) return t("pricing.overflowNo");
	if (rule.floor === null) return t("pricing.noFloor", { rate: rule.rate });
	return t("pricing.overflowYes", { rate: rule.rate, floor: quotaAmount(rule.floor, locale) });
}
