import { Button } from "@yonder/ui-components";
import { useInvite } from "@yonder/ui-data";
import { Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCompact, formatExact, QuotaNumber } from "./quota-number.tsx";

export function InviteSection() {
	const { t, i18n } = useTranslation();
	const invite = useInvite();
	const [copied, setCopied] = useState<"code" | "link" | null>(null);
	const [failure, setFailure] = useState(false);
	const [ruleExpanded, setRuleExpanded] = useState(false);
	const locale = i18n.resolvedLanguage ?? i18n.language;

	if (!invite.data) {
		return invite.isError ? (
			<Button variant="link" onClick={() => void invite.refetch()}>
				{t("app.retry")}
			</Button>
		) : (
			<p role="status">{t("app.loading")}</p>
		);
	}
	const { code, link, stats, rewardRule } = invite.data;
	const rule = (exact: boolean) =>
		t("me.invite.rewardRule", {
			newUserGets: (exact ? formatExact : formatCompact)(rewardRule.newUserGets, locale),
			inviterGets: (exact ? formatExact : formatCompact)(rewardRule.inviterGets, locale),
		});
	async function copy(value: string, what: "code" | "link") {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(what);
			setFailure(false);
		} catch {
			setFailure(true);
		}
	}

	return (
		<div className="flex flex-col gap-[var(--spacing-6)]">
			<div className="flex flex-col items-start gap-[var(--spacing-2)]">
				<p className="text-caption text-[var(--color-text-secondary)]">{t("me.invite.code")}</p>
				<p className="break-all text-title font-semibold tabular-nums text-[var(--color-text-primary)]">{code}</p>
				<Button variant="secondary" size="sm" onClick={() => void copy(code, "code")}>
					<span className="inline-flex items-center gap-[var(--spacing-2)]">
						<Copy size={16} aria-hidden="true" />
						{copied === "code" ? t("app.copied") : t("app.copy")}
					</span>
				</Button>
			</div>
			<div className="flex flex-col items-start gap-[var(--spacing-2)]">
				<p className="text-caption text-[var(--color-text-secondary)]">{t("me.invite.link")}</p>
				<p className="w-full break-all text-body text-[var(--color-text-primary)]">{link}</p>
				<div className="flex flex-wrap gap-[var(--spacing-2)]">
					<Button variant="secondary" size="sm" onClick={() => void copy(link, "link")}>
						<span className="inline-flex items-center gap-[var(--spacing-2)]">
							<Copy size={16} aria-hidden="true" />
							{copied === "link" ? t("app.copied") : t("app.copy")}
						</span>
					</Button>
					{typeof navigator.share === "function" ? (
						<Button
							variant="secondary"
							size="sm"
							onClick={() => void navigator.share({ url: link }).catch(() => undefined)}
						>
							<span className="inline-flex items-center gap-[var(--spacing-2)]">
								<Share2 size={16} aria-hidden="true" />
								{t("me.invite.share")}
							</span>
						</Button>
					) : null}
				</div>
				{failure ? (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{t("me.invite.copyFailed")}
					</p>
				) : null}
			</div>
			<div className="flex flex-wrap gap-x-[var(--spacing-8)] gap-y-[var(--spacing-3)] text-body text-[var(--color-text-secondary)]">
				<p>
					{t("me.invite.invited")} <QuotaNumber value={stats.invitedCount} locale={locale} />
				</p>
				<p>
					{t("me.invite.received")} <QuotaNumber value={stats.grantedTotal} locale={locale} />
				</p>
			</div>
			<button
				type="button"
				title={rule(true)}
				onClick={() => setRuleExpanded(!ruleExpanded)}
				className="self-start text-start text-caption text-[var(--color-text-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
			>
				{rule(ruleExpanded)}
			</button>
		</div>
	);
}
