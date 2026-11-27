import { Button } from "@yonder/ui-components";
import { useInvite, useMe } from "@yonder/ui-data";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { Copy, Link2, QrCode, Share2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InviteLifeIllustration } from "./invite-life-illustration.tsx";
import { canShareNatively, shareNatively } from "./invite-share.ts";
import { InviteShareCard } from "./invite-share-card.tsx";
import { InviteTrack } from "./invite-track.tsx";
import { formatExact, formatQuota } from "./quota-number.tsx";

/** Without a server limit the track still needs a length; five matches the personal invite limit. */
const DEFAULT_SPOTS = 5;

/**
 * The whole page fits one screen: side by side in a wide, short desktop pane, stacked on a phone,
 * with the illustration as the part that gives way to height.
 */
export function InviteSection() {
	const { t, i18n } = useTranslation();
	const invite = useInvite();
	const me = useMe();
	const { mode } = useShellChrome();
	const [copied, setCopied] = useState<"code" | "link" | null>(null);
	const [failure, setFailure] = useState<"copy" | "share" | null>(null);
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
	const { code, link, stats, rewardRule, activation } = invite.data;
	const name = me.data?.member.displayName ?? "Yonder";
	const remaining = rewardRule.maxInvites === null ? null : Math.max(0, rewardRule.maxInvites - stats.invitedCount);
	const full = activation?.remaining === 0;
	const spots = activation?.limit ?? rewardRule.maxInvites ?? DEFAULT_SPOTS;
	const joined = Math.min(stats.invitedCount, spots);
	const shareText = t("inviteExperience.shareText", { name, code });
	const status = full
		? t("inviteExperience.activationFull", { limit: activation.limit })
		: remaining === 0
			? t("inviteExperience.limitReached")
			: activation
				? t("inviteExperience.activationRemaining", { remaining: formatExact(activation.remaining, locale) })
				: null;
	async function copy(value: string, what: "code" | "link") {
		setCopied(null);
		setFailure(null);
		try {
			await navigator.clipboard.writeText(value);
			setCopied(what);
		} catch {
			setFailure("copy");
		}
	}
	async function share() {
		if (!canShareNatively()) {
			setDialog("card");
			return;
		}
		setFailure(null);
		try {
			await shareNatively({ title: t("inviteExperience.title"), text: shareText, url: link });
		} catch {
			setFailure("share");
		}
	}
	const pill = "!rounded-[var(--radius-full)]";
	return (
		<>
			<div className="@container rounded-[var(--radius-panel)] bg-[var(--color-bg-chrome)] p-[var(--spacing-3)]">
				<section className="relative grid gap-[var(--spacing-5)] rounded-[var(--radius-card)] bg-[var(--color-bg-card)] p-[var(--spacing-5)] @[40rem]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] @[40rem]:items-center @[40rem]:gap-[var(--spacing-8)] @[40rem]:p-[var(--spacing-6)]">
					<Button
						size="sm"
						variant="ghost"
						onClick={() => setDialog("rules")}
						className={`${pill} absolute end-[var(--spacing-3)] top-[var(--spacing-3)]`}
					>
						{t("inviteExperience.rules")}
					</Button>
					<div className="flex min-w-0 flex-col items-center gap-[var(--spacing-3)] text-center @[40rem]:items-start @[40rem]:text-start">
						<div
							className="h-[clamp(calc(var(--spacing-16)*1.5),20dvh,calc(var(--spacing-16)*3))] w-full max-w-[calc(var(--spacing-16)*5)]"
							aria-hidden="true"
						>
							<InviteLifeIllustration />
						</div>
						<h2 className="max-w-full break-words text-h1 font-semibold @[40rem]:text-title text-[var(--color-text-primary)]">
							<span className="text-[var(--color-accent-text)]">{name}</span> {t("inviteExperience.headline")}
							<br />
							{t("inviteExperience.together")}
						</h2>
						<p className="text-body text-[var(--color-text-primary)]">{t("inviteExperience.slogan")}</p>
						<p className="text-caption font-medium text-[var(--color-accent-text)]">{t("inviteExperience.tagline")}</p>
					</div>
					<div className="flex min-w-0 flex-col gap-[var(--spacing-4)]">
						<InviteTrack spots={spots} joined={joined} reward={formatQuota(rewardRule.inviterGets, locale)} />
						<p className="flex flex-wrap justify-between gap-x-[var(--spacing-3)] text-caption text-[var(--color-text-secondary)]">
							<span>{status}</span>
							<span className="tabular-nums">
								{t("inviteExperience.received", { amount: formatQuota(stats.grantedTotal, locale) })}
							</span>
						</p>
						<div className="flex items-center gap-[var(--spacing-3)] rounded-[var(--radius-control)] bg-[var(--color-bg-base)] py-[var(--spacing-2)] ps-[var(--spacing-4)] pe-[var(--spacing-2)]">
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="text-micro text-[var(--color-text-secondary)]">{t("me.invite.code")}</span>
								<span className="truncate font-mono text-h3 font-semibold tracking-[0.08em] text-[var(--color-text-primary)]">
									{code}
								</span>
							</span>
							<Button size="sm" disabled={full} onClick={() => void copy(code, "code")} className={pill}>
								<Copy size={14} aria-hidden="true" />
								{copied === "code" ? t("app.copied") : t("inviteExperience.copyCode")}
							</Button>
						</div>
						<div className="grid grid-cols-3 gap-[var(--spacing-2)]">
							<Button disabled={full} onClick={() => void copy(link, "link")} className={pill}>
								<Link2 size={16} aria-hidden="true" />
								{copied === "link" ? t("app.copied") : t("inviteExperience.copyLink")}
							</Button>
							<Button disabled={full} onClick={() => setDialog("card")} className={pill}>
								<QrCode size={16} aria-hidden="true" />
								{t("inviteExperience.shareCard")}
							</Button>
							<Button disabled={full} variant="primary" onClick={() => void share()} className={pill}>
								<Share2 size={16} aria-hidden="true" />
								{t("inviteExperience.shareNow")}
							</Button>
						</div>
						{copied ? (
							<span role="status" className="sr-only">
								{t("app.copied")}
							</span>
						) : null}
						{failure && dialog !== "card" ? (
							<p role="alert" className="text-caption text-[var(--color-danger)]">
								{t(failure === "copy" ? "me.invite.copyFailed" : "inviteExperience.shareFailed")}
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
					{activation ? <p>{t("inviteExperience.ruleActivation", { limit: activation.limit })}</p> : null}
					<p>
						{t("inviteExperience.ruleReward", {
							newUserGets: formatExact(rewardRule.newUserGets, locale),
							inviterGets: formatExact(rewardRule.inviterGets, locale),
						})}
					</p>
					{activation ? null : (
						<p>
							{remaining === null
								? t("inviteExperience.ruleUnlimited")
								: t("inviteExperience.ruleLimit", { count: rewardRule.maxInvites })}
						</p>
					)}
					<p>{t("inviteExperience.ruleExisting")}</p>
					<p className="break-all text-caption text-[var(--color-text-secondary)]">{link}</p>
				</div>
			</Overlay>
			{dialog === "card" && !full ? (
				<InviteShareCard
					name={name}
					code={code}
					link={link}
					shareText={shareText}
					onClose={() => setDialog(null)}
					onCopy={() => void copy(link, "link")}
					copied={copied === "link"}
				/>
			) : null}
			{failure === "copy" && dialog === "card" ? (
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
