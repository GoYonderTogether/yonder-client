import type { MemoryVisibility as Visibility } from "@yonder/protocol";
import { Button, cn } from "@yonder/ui-components";
import { ChevronDown, Globe, Lock, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export const VISIBILITY = {
	private: { Icon: LockKeyhole, label: "memory.private" },
	public: { Icon: Globe, label: "memory.public" },
	secret: { Icon: Lock, label: "memory.secret" },
} as const;

const LEVELS = ["private", "public", "secret"] as const;

/**
 * The quiet mark on a card or a list row (24 第三节、第五节). Private is the default and shows
 * nothing; public and secret each get one small icon, named on hover and to assistive tech.
 */
export function VisibilityMark({ visibility }: { visibility: Visibility | undefined }) {
	const { t } = useTranslation();
	if (!visibility || visibility === "private") return null;
	const { Icon, label } = VISIBILITY[visibility];
	return (
		<span title={t(label)} className="inline-flex shrink-0 text-[var(--color-text-tertiary)]">
			<Icon size={14} aria-label={t(label)} role="img" />
		</span>
	);
}

/**
 * The label on a file's own page, where visibility is changed (24 第五节). All three levels are
 * shown here. Public and secret each change who or what can read the file, so they ask once;
 * going back to private only narrows it and does not ask.
 */
export function VisibilityControl({
	visibility,
	disabled,
	busy,
	onChange,
}: {
	visibility: Visibility;
	disabled: boolean;
	busy: boolean;
	onChange: (visibility: Visibility) => void;
}) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [asking, setAsking] = useState<"public" | "secret" | null>(null);
	const root = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const outside = (event: Event) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [open]);
	const { Icon, label } = VISIBILITY[visibility];
	const pick = (level: Visibility) => {
		setOpen(false);
		if (level === visibility) return;
		if (level === "private") onChange(level);
		else setAsking(level);
	};
	return (
		<div ref={root} className="relative flex flex-col gap-[var(--spacing-2)]">
			<button
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label={`${t("memory.visibility")}: ${t(label)}`}
				disabled={disabled || busy}
				onClick={() => setOpen(!open)}
				onKeyDown={(event) => {
					if (event.key === "Escape" && open) {
						event.preventDefault();
						event.stopPropagation();
						setOpen(false);
					}
				}}
				className={cn(
					"inline-flex h-[var(--control-sm)] w-fit items-center gap-[var(--spacing-1)] rounded-[var(--radius-full)] px-[var(--spacing-3)] text-caption",
					"bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]",
					"focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60",
				)}
			>
				<Icon size={14} aria-hidden />
				{t(label)}
				<ChevronDown size={14} aria-hidden />
			</button>
			{open ? (
				<div
					role="menu"
					aria-label={t("memory.visibility")}
					className="absolute top-full left-0 z-50 mt-[var(--spacing-1)] min-w-max rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] p-[var(--spacing-1)] shadow-[var(--shadow-lg)]"
				>
					{LEVELS.map((level) => {
						const item = VISIBILITY[level];
						return (
							<button
								key={level}
								type="button"
								role="menuitemradio"
								aria-checked={level === visibility}
								onClick={() => pick(level)}
								className="flex w-full items-center gap-[var(--spacing-3)] rounded-[var(--radius-control-sm)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-start text-body text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] focus-visible:bg-[var(--color-bg-hover)] aria-checked:font-medium"
							>
								<item.Icon size={16} aria-hidden />
								{t(item.label)}
							</button>
						);
					})}
				</div>
			) : null}
			{asking ? (
				<div
					role="alertdialog"
					aria-label={t(asking === "public" ? "memory.makePublic" : "memory.makeSecret")}
					className="flex flex-col gap-[var(--spacing-3)] rounded-[var(--radius-lg)] bg-[var(--color-bg-subtle)] p-[var(--spacing-4)]"
				>
					<p className="text-body text-[var(--color-text-primary)]">
						{t(asking === "public" ? "memory.makePublicQuestion" : "memory.makeSecretQuestion")}
					</p>
					<div className="flex justify-end gap-[var(--spacing-2)]">
						<Button size="sm" disabled={busy} onClick={() => setAsking(null)}>
							{t("app.cancel")}
						</Button>
						<Button
							size="sm"
							variant="primary"
							loading={busy}
							onClick={() => {
								onChange(asking);
								setAsking(null);
							}}
						>
							{t(asking === "public" ? "memory.makePublic" : "memory.makeSecret")}
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
