import type { Member } from "@yonder/protocol";
import { Avatar, BrandedQrCode, Button, Checkbox, cn, IconButton } from "@yonder/ui-components";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { Check, ChevronRight, Layers2, LockKeyhole, Pencil, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useObjectUrl } from "../../lib/use-object-url.ts";

const INTERESTS = ["Explore", "Create", "Read", "Travel", "Music", "Move"] as const;

export function MemoryCards({ person }: { person?: Member | undefined }) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const [front, setFront] = useState<"public" | "ai">("public");
	const [expanded, setExpanded] = useState(false);
	const [editing, setEditing] = useState(false);
	const [showAvatar, setShowAvatar] = useState(true);
	const [showBio, setShowBio] = useState(false);
	const [photo, setPhoto] = useState<File>();
	const photoUrl = useObjectUrl(photo);
	const [interests, setInterests] = useState<string[]>([]);
	const [draft, setDraft] = useState({ showAvatar, showBio, photo, interests });
	const openEditor = () => {
		setDraft({ showAvatar, showBio, photo, interests });
		setEditing(true);
	};
	const publicCard = (
		<div className="flex h-full flex-col gap-[var(--spacing-4)] p-[var(--spacing-5)]">
			<div className="flex items-center justify-between gap-[var(--spacing-2)]">
				<span className="text-caption text-[var(--color-text-secondary)]">{t("memory.publicCard")}</span>
				<IconButton size="sm" aria-label={t("memory.editCard")} onClick={openEditor} disabled={!person}>
					<Pencil size={16} aria-hidden />
				</IconButton>
			</div>
			<div className="flex min-w-0 items-center gap-[var(--spacing-3)]">
				{showAvatar && person ? (
					<Avatar name={person.displayName} src={photoUrl || person.avatarUrl} size={48} />
				) : null}
				<div className="min-w-0">
					<h2 className="break-words text-h2 font-semibold">{person?.displayName ?? t("memory.publicCard")}</h2>
					{person ? (
						<p className="break-all text-caption text-[var(--color-text-secondary)]">@{person.handle}</p>
					) : null}
				</div>
			</div>
			{showBio && person?.bio ? (
				<p className="break-words text-body text-[var(--color-text-secondary)]">{person.bio}</p>
			) : null}
			{interests.length ? (
				<div className="flex flex-wrap gap-[var(--spacing-2)]">
					{interests.map((interest) => (
						<span
							key={interest}
							className="rounded-[var(--radius-full)] bg-[var(--color-bg-subtle)] px-[var(--spacing-3)] py-[var(--spacing-1)] text-caption"
						>
							{t(`memory.interest${interest}`)}
						</span>
					))}
				</div>
			) : null}
			{person ? (
				<div className="mt-auto flex items-end justify-between gap-[var(--spacing-3)]">
					<span className="text-caption text-[var(--color-text-secondary)]">{t("memory.cardCode")}</span>
					<BrandedQrCode value={`@${person.handle}`} label={t("memory.cardCode")} size={96} />
				</div>
			) : null}
		</div>
	);
	const aiCard = (
		<div className="flex h-full flex-col gap-[var(--spacing-4)] p-[var(--spacing-5)]">
			<div className="flex items-center justify-between gap-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]">
				<span className="flex items-center gap-[var(--spacing-2)]">
					<Sparkles size={16} aria-hidden />
					{t("memory.aiCard")}
				</span>
				<LockKeyhole size={14} aria-label={t("memory.private")} />
			</div>
			<div className="flex flex-1 flex-col justify-center gap-[var(--spacing-3)] py-[var(--spacing-6)]">
				<h2 className="text-h2 font-semibold">{t("memory.aiEmpty")}</h2>
				<p className="text-body text-[var(--color-text-secondary)]">{t("memory.aiEmptyBody")}</p>
			</div>
			<p className="text-caption text-[var(--color-text-secondary)]">{t("memory.private")}</p>
		</div>
	);
	return (
		<section className="memory-cards" aria-label={t("memory.aboutMe")}>
			<div className={cn("memory-card-stack", expanded && "memory-card-stack-expanded")}>
				{(["public", "ai"] as const).map((card) => (
					<div
						key={card}
						className={cn(
							"memory-card",
							card === "ai" && "memory-card-ai",
							front === card ? "memory-card-front" : "memory-card-back",
						)}
					>
						{front !== card && !expanded ? (
							<button
								type="button"
								className="memory-card-switch"
								onClick={() => setFront(card)}
								aria-label={t("memory.switchCard", {
									card: t(card === "public" ? "memory.publicCard" : "memory.aiCard"),
								})}
							>
								<span>{t(card === "public" ? "memory.publicCard" : "memory.aiCard")}</span>
								<ChevronRight size={16} aria-hidden />
							</button>
						) : card === "public" ? (
							publicCard
						) : (
							aiCard
						)}
					</div>
				))}
			</div>
			<div className="relative z-10 -mt-[var(--spacing-3)] flex justify-center">
				<IconButton
					variant="secondary"
					className="rounded-[var(--radius-full)] shadow-[var(--shadow-sm)]"
					aria-label={t(expanded ? "memory.collapseCards" : "memory.expandCards")}
					aria-expanded={expanded}
					onClick={() => setExpanded(!expanded)}
				>
					<Layers2 size={18} aria-hidden />
				</IconButton>
			</div>
			<Overlay
				open={editing}
				mode={mode}
				title={t("memory.cardEditor")}
				closeLabel={t("app.close")}
				onClose={() => setEditing(false)}
			>
				<div className="flex flex-col gap-[var(--spacing-5)] p-[var(--spacing-5)]">
					<p className="text-caption text-[var(--color-text-secondary)]">{t("memory.previewOnly")}</p>
					<Checkbox checked={draft.showAvatar} onChange={(e) => setDraft({ ...draft, showAvatar: e.target.checked })}>
						{t("memory.showAvatar")}
					</Checkbox>
					{draft.showAvatar ? (
						<div className="flex flex-wrap items-center gap-[var(--spacing-3)]">
							<label className="relative cursor-pointer rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] px-[var(--spacing-4)] py-[var(--spacing-3)] text-caption">
								<UserRound size={16} className="mr-[var(--spacing-2)] inline" aria-hidden />
								{t("memory.choosePhoto")}
								<input
									aria-label={t("memory.choosePhoto")}
									type="file"
									accept="image/*"
									className="absolute inset-0 w-full opacity-0"
									onChange={(event) => {
										const file = event.target.files?.[0];
										if (file?.type.startsWith("image/")) setDraft({ ...draft, photo: file });
									}}
								/>
							</label>
							{draft.photo ? (
								<Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, photo: undefined })}>
									{t("memory.removePhoto")}
								</Button>
							) : null}
						</div>
					) : null}
					{person?.bio ? (
						<Checkbox checked={draft.showBio} onChange={(e) => setDraft({ ...draft, showBio: e.target.checked })}>
							{t("memory.showBio")}
						</Checkbox>
					) : null}
					<fieldset>
						<legend className="mb-[var(--spacing-3)] text-caption text-[var(--color-text-secondary)]">
							{t("memory.interests")}
						</legend>
						<div className="flex flex-wrap gap-[var(--spacing-2)]">
							{INTERESTS.map((interest) => (
								<Button
									key={interest}
									size="sm"
									aria-pressed={draft.interests.includes(interest)}
									variant={draft.interests.includes(interest) ? "primary" : "secondary"}
									onClick={() =>
										setDraft({
											...draft,
											interests: draft.interests.includes(interest)
												? draft.interests.filter((item) => item !== interest)
												: [...draft.interests, interest],
										})
									}
								>
									{draft.interests.includes(interest) ? <Check size={14} aria-hidden /> : null}
									{t(`memory.interest${interest}`)}
								</Button>
							))}
						</div>
					</fieldset>
					<Button
						variant="primary"
						onClick={() => {
							setShowAvatar(draft.showAvatar);
							setShowBio(draft.showBio);
							setPhoto(draft.photo);
							setInterests(draft.interests);
							setEditing(false);
						}}
					>
						{t("app.done")}
					</Button>
				</div>
			</Overlay>
		</section>
	);
}
