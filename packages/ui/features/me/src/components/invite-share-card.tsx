import { BrandedQrCode, Button, Logo } from "@yonder/ui-components";
import { GesturePanel, useDismiss } from "@yonder/ui-shell";
import { Copy, Download, Share2, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { INVITE_CARD_FILENAME, renderInviteCard, saveInviteCard } from "./invite-card-image.ts";
import { InviteLifeIllustration } from "./invite-life-illustration.tsx";
import { canShareNatively, shareNatively } from "./invite-share.ts";

export function InviteShareCard({
	name,
	code,
	link,
	shareText,
	onClose,
	onCopy,
	copied,
}: {
	name: string;
	code: string;
	link: string;
	shareText: string;
	onClose: () => void;
	onCopy: () => void;
	copied: boolean;
}) {
	const { t, i18n } = useTranslation();
	const english = !(i18n.resolvedLanguage ?? i18n.language).startsWith("zh");
	const poster = useRef<SVGSVGElement>(null);
	const [saving, setSaving] = useState(false);
	const [sharing, setSharing] = useState(false);
	const [message, setMessage] = useState<"saved" | "saveFailed" | "shareFailed" | null>(null);
	useDismiss(true, onClose, 30);
	async function save() {
		if (!poster.current) return;
		setSaving(true);
		setMessage(null);
		try {
			await saveInviteCard(poster.current);
			setMessage("saved");
		} catch {
			setMessage("saveFailed");
		} finally {
			setSaving(false);
		}
	}
	/** The card image where the sheet takes files (phones, macOS); otherwise the link and text. */
	async function share() {
		if (!poster.current) return;
		setSharing(true);
		setMessage(null);
		try {
			const file = new File([await renderInviteCard(poster.current)], INVITE_CARD_FILENAME, { type: "image/png" });
			await shareNatively(
				navigator.canShare?.({ files: [file] }) ? { files: [file], text: shareText } : { text: shareText, url: link },
			);
		} catch {
			setMessage("shareFailed");
		} finally {
			setSharing(false);
		}
	}
	const shortName = [...name].length > 11 ? `${[...name].slice(0, 10).join("")}…` : name;
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[var(--color-bg-overlay)] p-[var(--spacing-4)] backdrop-blur-[var(--spacing-2)]">
			<button type="button" tabIndex={-1} onClick={onClose} aria-label={t("app.close")} className="absolute inset-0" />
			<GesturePanel
				open
				inline
				modal
				priority={30}
				layerKey="invitation-card"
				label={t("inviteExperience.shareCard")}
				onBack={onClose}
				className="m-auto !flex-none max-w-full items-center gap-[var(--spacing-4)]"
			>
				<svg
					ref={poster}
					viewBox="0 0 600 800"
					role="img"
					aria-label={t("inviteExperience.shareCard")}
					className="h-auto max-w-full rounded-[var(--radius-card)] shadow-[var(--shadow-lg)]"
					style={{ width: "min(52.5dvh, calc(var(--spacing-16) * 6), calc(100vw - var(--spacing-8)))" }}
				>
					<title>{`${name} · ${t("inviteExperience.title")}`}</title>
					<rect width="600" height="800" fill="var(--color-bg-surface)" />
					<g transform="translate(36 28)">
						<Logo size={34} />
					</g>
					<text x="80" y="54" fill="var(--color-text-primary)" fontSize="25" fontWeight="600">
						Yonder
					</text>
					<text x="44" y="108" fill="var(--color-accent-text)" fontSize="22" fontWeight="500">
						{t("inviteExperience.posterInvitedBy", { name: shortName })}
					</text>
					<text
						x="44"
						y="176"
						fill="var(--color-text-primary)"
						fontSize={english ? 40 : 46}
						fontWeight="600"
						letterSpacing="-1.2"
					>
						<tspan x="44">{t("inviteExperience.posterTitleLine1")}</tspan>
						<tspan x="44" dy="55">
							{t("inviteExperience.posterTitleLine2")}
						</tspan>
					</text>
					<text x="44" y="273" fill="var(--color-text-secondary)" fontSize="22">
						{t("inviteExperience.posterValue")}
					</text>
					<g transform="translate(40 293)">
						<svg width="520" height="255" viewBox="0 0 520 285" aria-hidden="true">
							<InviteLifeIllustration />
						</svg>
					</g>
					<text x="44" y="573" fill="var(--color-text-secondary)" fontSize="20">
						<tspan x="44">{t("inviteExperience.posterPositionLine1")}</tspan>
						<tspan x="44" dy="30">
							{t("inviteExperience.posterPositionLine2")}
						</tspan>
					</text>
					<rect x="0" y="630" width="600" height="170" fill="var(--color-bg-chrome)" />
					<text x="36" y="684" fill="var(--color-text-primary)" fontSize="25" fontWeight="600">
						{t("inviteExperience.scan")}
					</text>
					<text x="36" y="726" fill="var(--color-text-secondary)" fontSize="18">
						{t("me.invite.code")}
					</text>
					<text x="36" y="755" fill="var(--color-text-primary)" fontSize="18">
						{code}
					</text>
					<g transform="translate(420 642)">
						<BrandedQrCode value={link} label={t("inviteExperience.scan")} size={144} />
					</g>
				</svg>
				<div className="flex max-w-full flex-wrap justify-center gap-[var(--spacing-2)]">
					{canShareNatively() ? (
						<Button
							loading={sharing}
							variant="primary"
							onClick={() => void share()}
							className="!rounded-[var(--radius-full)]"
						>
							<Share2 size={16} aria-hidden="true" />
							{t("inviteExperience.shareNow")}
						</Button>
					) : null}
					<Button
						loading={saving}
						onClick={() => void save()}
						className="!rounded-[var(--radius-full)] !bg-[var(--color-bg-surface)] enabled:hover:!bg-[var(--color-bg-chrome)]"
					>
						<Download size={16} aria-hidden="true" />
						{t("inviteExperience.saveImage")}
					</Button>
					<Button
						onClick={onCopy}
						className="!rounded-[var(--radius-full)] !bg-[var(--color-bg-surface)] enabled:hover:!bg-[var(--color-bg-chrome)]"
					>
						<Copy size={16} aria-hidden="true" />
						{copied ? t("app.copied") : t("inviteExperience.copyLink")}
					</Button>
					<Button
						onClick={onClose}
						className="!rounded-[var(--radius-full)] !bg-[var(--color-bg-surface)] enabled:hover:!bg-[var(--color-bg-chrome)]"
					>
						<X size={16} aria-hidden="true" />
						{t("app.close")}
					</Button>
				</div>
				{message ? (
					<p
						role={message === "saved" ? "status" : "alert"}
						className="rounded-[var(--radius-control)] bg-[var(--color-bg-surface)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-caption text-[var(--color-text-primary)]"
					>
						{t(`inviteExperience.${message}`)}
					</p>
				) : null}
			</GesturePanel>
		</div>
	);
}
