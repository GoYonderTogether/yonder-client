import { Button } from "@yonder/ui-components";
import { useInvite, useMe } from "@yonder/ui-data";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { ArrowRight, Copy, Gift, QrCode, Share2, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InviteLifeIllustration } from "./invite-life-illustration.tsx";
import { InviteShareCard } from "./invite-share-card.tsx";
import { formatExact, formatQuota, QuotaNumber } from "./quota-number.tsx";

export function InviteSection() {
	const { t, i18n } = useTranslation();
	const invite = useInvite();
	const me = useMe();
	const { mode } = useShellChrome();
	const [copied, setCopied] = useState<"code" | "link" | null>(null);
	const [failure, setFailure] = useState(false);
	const [dialog, setDialog] = useState<"rules" | "card" | null>(null);
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
	const name = me.data?.member.displayName ?? "Yonder";
	const remaining = rewardRule.maxInvites === null ? null : Math.max(0, rewardRule.maxInvites - stats.invitedCount);
	async function copy(value: string, what: "code" | "link") {
		setCopied(null);
		setFailure(false);
		try {
			await navigator.clipboard.writeText(value);
			setCopied(what);
			setFailure(false);
		} catch {
			setFailure(true);
		}
	}
	return (
		<>
			<div className="rounded-[var(--radius-panel)] bg-[var(--color-bg-chrome)] p-[var(--spacing-3)]">
				<div className="mb-[var(--spacing-3)] flex justify-end">
					<Button
						size="sm"
						variant="ghost"
						onClick={() => setDialog("rules")}
						className="!rounded-[var(--radius-full)]"
					>
						{t("inviteExperience.rules")}
					</Button>
				</div>
				<section className="flex flex-col items-center gap-[var(--spacing-8)] rounded-[var(--radius-card)] bg-[var(--color-bg-card)] px-[var(--spacing-5)] py-[var(--spacing-8)] text-center">
					<div className="flex min-w-0 w-full flex-col items-center gap-[var(--spacing-5)]">
						<div className="w-[calc(var(--spacing-16)*4)] max-w-full" aria-hidden="true">
							<InviteLifeIllustration />
						</div>
						<h2 className="max-w-full break-words text-title font-semibold text-[var(--color-text-primary)]">
							<span className="text-[var(--color-accent-text)]">{name}</span> {t("inviteExperience.headline")}
							<br />
							{t("inviteExperience.together")}
						</h2>
						<p className="text-body text-[var(--color-text-secondary)]">{t("inviteExperience.productPosition")}</p>
						<p className="text-caption text-[var(--color-text-secondary)]">{t("inviteExperience.intro")}</p>
					</div>
					<div className="flex w-full flex-col items-center gap-[var(--spacing-3)] pt-[var(--spacing-4)]">
						<p className="text-h3 text-[var(--color-text-primary)]">
							{t("inviteExperience.invited")}{" "}
							<strong className="text-h1 text-[var(--color-accent-text)]">
								<span className="tabular-nums">{formatExact(stats.invitedCount, locale)}</span>
							</strong>
						</p>
						<p className="text-caption text-[var(--color-text-secondary)]">
							{remaining === 0
								? t("inviteExperience.limitReached")
								: t("inviteExperience.nextReward", { amount: formatQuota(rewardRule.inviterGets, locale) })}
						</p>
						{remaining !== null ? (
							<p className="text-caption text-[var(--color-text-secondary)]">
								{t("inviteExperience.limit", { remaining: formatExact(remaining, locale) })}
							</p>
						) : null}
						<div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-[var(--spacing-3)] py-[var(--spacing-4)]">
							<div className="flex flex-col items-center gap-[var(--spacing-2)]">
								<UserRoundCheck size={22} aria-hidden="true" />
								<p className="text-caption text-[var(--color-text-primary)]">{t("inviteExperience.newFriend")}</p>
								<p className="text-micro text-[var(--color-text-secondary)]">
									{t("inviteExperience.friendReward", { amount: formatQuota(rewardRule.newUserGets, locale) })}
								</p>
							</div>
							<ArrowRight size={20} className="text-[var(--color-text-tertiary)]" aria-hidden="true" />
							<div className="flex flex-col items-center gap-[var(--spacing-2)]">
								<Gift size={22} aria-hidden="true" />
								<p className="text-caption text-[var(--color-text-primary)]">
									{t("inviteExperience.yourReward", { amount: formatQuota(rewardRule.inviterGets, locale) })}
								</p>
								<p className="text-micro text-[var(--color-text-secondary)]">
									{t("inviteExperience.received")} <QuotaNumber value={stats.grantedTotal} locale={locale} />
								</p>
							</div>
						</div>
					</div>
					<div className="flex w-full flex-col gap-[var(--spacing-3)]">
						<div className="grid grid-cols-2 gap-[var(--spacing-3)]">
							<Button onClick={() => void copy(link, "link")} className="!rounded-[var(--radius-full)]">
								<Copy size={16} aria-hidden="true" />
								{copied === "link" ? t("app.copied") : t("inviteExperience.copyLink")}
							</Button>
							<Button variant="primary" onClick={() => setDialog("card")} className="!rounded-[var(--radius-full)]">
								<Share2 size={16} aria-hidden="true" />
								{t("inviteExperience.shareNow")}
							</Button>
						</div>
						<Button variant="link" onClick={() => setDialog("card")}>
							<QrCode size={16} aria-hidden="true" />
							{t("inviteExperience.cardHint")}
						</Button>
						{copied ? (
							<span role="status" className="sr-only">
								{t("app.copied")}
							</span>
						) : null}
						{failure && dialog !== "card" ? (
							<p role="alert" className="text-caption text-[var(--color-danger)]">
								{t("me.invite.copyFailed")}
							</p>
						) : null}
					</div>
				</section>
			</div>
			<Overlay
				open={dialog === "rules"}
				onClose={() => setDialog(null)}
				title={t("inviteExperience.rules")}
				mode={mode}
				closeLabel={t("app.close")}
			>
				<div className="flex flex-col gap-[var(--spacing-5)] p-[var(--spacing-6)] text-body text-[var(--color-text-primary)]">
					<p>{t("inviteExperience.ruleJoin")}</p>
					<p>
						{t("inviteExperience.ruleReward", {
							newUserGets: formatExact(rewardRule.newUserGets, locale),
							inviterGets: formatExact(rewardRule.inviterGets, locale),
						})}
					</p>
					<p>
						{remaining === null
							? t("inviteExperience.ruleUnlimited")
							: t("inviteExperience.ruleLimit", { count: rewardRule.maxInvites })}
					</p>
					<p>{t("inviteExperience.ruleExisting")}</p>
					<div className="rounded-[var(--radius-card)] bg-[var(--color-bg-base)] p-[var(--spacing-4)]">
						<p className="text-caption text-[var(--color-text-secondary)]">{t("me.invite.code")}</p>
						<p className="break-all text-h2 font-semibold">{code}</p>
						<Button variant="link" onClick={() => void copy(code, "code")}>
							{copied === "code" ? t("app.copied") : t("app.copy")}
						</Button>
					</div>
					<p className="break-all text-caption text-[var(--color-text-secondary)]">{link}</p>
					{failure ? (
						<p role="alert" className="text-caption text-[var(--color-danger)]">
							{t("me.invite.copyFailed")}
						</p>
					) : null}
				</div>
			</Overlay>
			{dialog === "card" ? (
				<InviteShareCard
					name={name}
					code={code}
					link={link}
					onClose={() => setDialog(null)}
					onCopy={() => void copy(link, "link")}
					copied={copied === "link"}
				/>
			) : null}
			{failure && dialog === "card" ? (
				<p
					role="alert"
					className="fixed bottom-[var(--spacing-4)] start-[var(--spacing-4)] z-50 rounded-[var(--radius-control)] bg-[var(--color-bg-surface)] p-[var(--spacing-3)] text-caption text-[var(--color-danger)]"
				>
					{t("me.invite.copyFailed")}
				</p>
			) : null}
		</>
	);
}
