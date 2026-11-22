import { MemberHeader } from "@yonder/feature-members";
import type { MemberCard } from "@yonder/protocol";
import { Button, Card, InlineError } from "@yonder/ui-components";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * The owner's namecard draft: one row that opens the exact visitor card the action would publish.
 * The preview is the same read-only identity renderer a visitor sees, so nothing private leaks.
 */
export function NamecardReviewCard({
	title,
	preview,
	canPublish,
	busy,
	disconnected,
	error,
	onPublish,
	onRetry,
}: {
	title: string;
	preview: MemberCard;
	/** The card is open and still offers the publish action. */
	canPublish: boolean;
	busy: boolean;
	disconnected: boolean;
	error: "stale" | "failed" | undefined;
	onPublish: () => void;
	onRetry: () => void;
}) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const [reviewing, setReviewing] = useState(false);
	return (
		<section className="w-full min-w-0 max-w-[var(--width-form)]" aria-label={title}>
			<Card className={canPublish ? "p-0" : undefined}>
				{canPublish ? (
					<Button
						variant="ghost"
						block
						aria-haspopup="dialog"
						className="h-auto min-h-[var(--control-lg)] justify-start rounded-[var(--radius-card)] p-[var(--card-padding)] text-start"
						onClick={() => setReviewing(true)}
					>
						<span className="flex flex-col items-start gap-[var(--spacing-1)]">
							<span className="wrap-anywhere text-body font-semibold">{title}</span>
							<span className="text-caption text-[var(--color-accent-text)]">{t("me.namecard.review")}</span>
						</span>
					</Button>
				) : (
					<p className="wrap-anywhere text-body font-semibold">{title}</p>
				)}
			</Card>
			<Overlay
				open={reviewing && canPublish}
				onClose={() => !busy && setReviewing(false)}
				title={t("me.namecard.reviewTitle")}
				mode={mode}
				closeLabel={t("app.close")}
				mobileBackLabel={t("app.back")}
				footer={
					<>
						{error ? (
							<InlineError
								className="w-full"
								{...(error === "failed" && !disconnected ? { onRetry, retryLabel: t("app.retry") } : {})}
							>
								{t(`me.namecard.${error === "stale" ? "stale" : "publishFailed"}`)}
							</InlineError>
						) : null}
						<Button onClick={() => setReviewing(false)} disabled={busy}>
							{t("app.cancel")}
						</Button>
						<Button
							variant="primary"
							disabled={busy || disconnected || error === "stale"}
							loading={busy}
							onClick={onPublish}
						>
							{t("me.namecard.publish")}
						</Button>
					</>
				}
			>
				<MemberHeader card={preview} />
			</Overlay>
		</section>
	);
}
