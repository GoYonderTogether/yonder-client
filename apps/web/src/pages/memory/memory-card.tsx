import { firstCharacter } from "@yonder/chat-model";
import { savePosterImage } from "@yonder/feature-me";
import type { Member } from "@yonder/protocol";
import { BrandedQrCode, Button, ListGroup, ListRow, Logo } from "@yonder/ui-components";
import { useInvite, usePerson } from "@yonder/ui-data";
import { Copy, Download, Share2 } from "lucide-react";
import { type Ref, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { cardLink, cardOrigin } from "../../lib/card-link.ts";

const WIDTH = 600;
const HEIGHT = 780;

/** Lines of at most `size` characters, at most `lines` of them, the last one ending in … when cut. */
function wrap(text: string, size: number, lines: number): string[] {
	const characters = [...text.replace(/\s+/g, " ").trim()];
	const out: string[] = [];
	for (let start = 0; start < characters.length && out.length < lines; start += size)
		out.push(characters.slice(start, start + size).join(""));
	if (characters.length > size * lines && out.length) out[out.length - 1] = `${out.at(-1)?.slice(0, -1)}…`;
	return out;
}

/**
 * A remote picture would taint the canvas the saved image is drawn on, so the avatar is read once
 * into a data URL; when it cannot be read, the card falls back to the initial, as `Avatar` does.
 */
function useInlineImage(src: string | null | undefined): string | null {
	const [data, setData] = useState<string | null>(null);
	useEffect(() => {
		setData(null);
		if (!src) return;
		let live = true;
		fetch(src)
			.then((response) => (response.ok ? response.blob() : Promise.reject(new Error("unavailable"))))
			.then(
				(blob) =>
					new Promise<string>((resolve, reject) => {
						const reader = new FileReader();
						reader.onload = () => resolve(String(reader.result));
						reader.onerror = () => reject(reader.error);
						reader.readAsDataURL(blob);
					}),
			)
			.then((url) => {
				if (live) setData(url);
			})
			.catch(() => undefined);
		return () => {
			live = false;
		};
	}, [src]);
	return data;
}

/** The poster itself: what a phone scans and what「保存图片」writes, drawn once as one SVG. */
function CardPoster({ person, link, poster }: { person: Member; link: string; poster: Ref<SVGSVGElement> }) {
	const { t, i18n } = useTranslation();
	const english = !(i18n.resolvedLanguage ?? i18n.language).startsWith("zh");
	const picture = useInlineImage(person.avatarUrl);
	const tint = person.avatarColor && /^[1-6]$/.test(person.avatarColor) ? person.avatarColor : "1";
	const name = wrap(person.displayName, english ? 22 : 12, 1)[0] ?? "";
	const bio = person.bio ? wrap(person.bio, english ? 40 : 20, 2) : [];
	const qrTop = 330 + bio.length * 34;
	return (
		<svg
			ref={poster}
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			role="img"
			aria-label={t("memory.cardQr")}
			className="h-auto w-full max-w-[360px] rounded-[var(--radius-card)] shadow-[var(--shadow-sm)]"
		>
			<title>{`${person.displayName} · Yonder`}</title>
			<rect width={WIDTH} height={HEIGHT} fill="var(--color-bg-surface)" />
			<g transform="translate(36 30)">
				<Logo size={30} />
			</g>
			<text x="76" y="53" fill="var(--color-text-secondary)" fontSize="22" fontWeight="600">
				Yonder
			</text>
			<clipPath id="memory-card-avatar">
				<circle cx={WIDTH / 2} cy="150" r="56" />
			</clipPath>
			{picture ? (
				<image
					href={picture}
					x={WIDTH / 2 - 56}
					y="94"
					width="112"
					height="112"
					preserveAspectRatio="xMidYMid slice"
					clipPath="url(#memory-card-avatar)"
				/>
			) : (
				<>
					<circle cx={WIDTH / 2} cy="150" r="56" fill={`var(--color-avatar-${tint}-bg)`} />
					<text
						x={WIDTH / 2}
						y="168"
						textAnchor="middle"
						fill={`var(--color-avatar-${tint}-fg)`}
						fontSize="48"
						fontWeight="600"
					>
						{firstCharacter(person.displayName)}
					</text>
				</>
			)}
			<text x={WIDTH / 2} y="252" textAnchor="middle" fill="var(--color-text-primary)" fontSize="36" fontWeight="600">
				{name}
			</text>
			<text x={WIDTH / 2} y="290" textAnchor="middle" fill="var(--color-text-secondary)" fontSize="22">
				@{person.handle}
			</text>
			{bio.map((line, index) => (
				<text
					key={line}
					x={WIDTH / 2}
					y={334 + index * 34}
					textAnchor="middle"
					fill="var(--color-text-secondary)"
					fontSize="22"
				>
					{line}
				</text>
			))}
			<g transform={`translate(${WIDTH / 2 - 130} ${qrTop})`}>
				<BrandedQrCode value={link} label={t("memory.cardQr")} size={260} />
			</g>
			<text x={WIDTH / 2} y={qrTop + 310} textAnchor="middle" fill="var(--color-text-secondary)" fontSize="22">
				{t("memory.cardScan")}
			</text>
		</svg>
	);
}

/**
 * 「我的名片」at the top of 「了解」 (11-15: the social face with its code, beside what the AI knows).
 * One address, `/@对外号` with the sharer's invite code; the rows lead to what decides the card:
 * the profile, who may open it, and what Bots may tell visitors.
 */
export function MemoryCard() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const person = usePerson();
	const invite = useInvite();
	const poster = useRef<SVGSVGElement>(null);
	const [status, setStatus] = useState<"saved" | "saveFailed" | "copied" | "copyFailed" | null>(null);
	const [saving, setSaving] = useState(false);
	if (!person) return null;
	const link = cardLink(person.handle, cardOrigin(), invite.data?.code);
	const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

	async function save() {
		if (!poster.current) return;
		setSaving(true);
		setStatus(null);
		try {
			await savePosterImage(poster.current, `yonder-${person?.handle ?? "card"}.png`);
			setStatus("saved");
		} catch {
			setStatus("saveFailed");
		} finally {
			setSaving(false);
		}
	}
	async function copy() {
		setStatus(null);
		try {
			await navigator.clipboard.writeText(link);
			setStatus("copied");
		} catch {
			setStatus("copyFailed");
		}
	}
	async function share() {
		try {
			await navigator.share({ title: `${person?.displayName} · Yonder`, url: link });
		} catch {
			// Closing the share sheet is an answer, not a failure.
		}
	}

	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			<ListGroup title={t("memory.cardTitle")} footer={t("memory.cardScope")}>
				<li className="flex flex-col items-center gap-[var(--spacing-4)] py-[var(--spacing-4)]">
					<CardPoster person={person} link={link} poster={poster} />
					<div className="flex flex-wrap justify-center gap-[var(--spacing-2)]">
						<Button loading={saving} onClick={() => void save()}>
							<Download size={16} aria-hidden="true" />
							{t("memory.cardSaveImage")}
						</Button>
						<Button onClick={() => void copy()}>
							<Copy size={16} aria-hidden="true" />
							{status === "copied" ? t("app.copied") : t("memory.cardCopyLink")}
						</Button>
						{canShare ? (
							<Button onClick={() => void share()}>
								<Share2 size={16} aria-hidden="true" />
								{t("memory.cardShare")}
							</Button>
						) : null}
					</div>
					{status === "saved" ? (
						<p role="status" className="text-caption text-[var(--color-text-secondary)]">
							{t("memory.cardSaved")}
						</p>
					) : status === "saveFailed" || status === "copyFailed" ? (
						<p role="alert" className="text-caption text-[var(--color-danger)]">
							{t(status === "saveFailed" ? "memory.cardSaveFailed" : "memory.cardCopyFailed")}
						</p>
					) : null}
				</li>
				<ListRow title={t("memory.cardEdit")} chevron onClick={() => navigate("/me/profile")} />
				<ListRow title={t("memory.cardVisibility")} chevron onClick={() => navigate("/me/privacy")} />
				<ListRow title={t("memory.cardInfo")} chevron onClick={() => navigate("/me/reception/info")} />
			</ListGroup>
		</div>
	);
}
