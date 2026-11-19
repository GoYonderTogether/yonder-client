import { useMemoryFileActions } from "@yonder/ui-data";
import { PenLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MemoryError } from "./memory-status.tsx";

/**
 * 「你改过」(24 第四节): the owner edited this file by hand, so Bots may only append to it. It is a
 * real state that changes what the Bot can do, so it is shown, and its one menu item lifts it.
 */
export function UserEditedBadge({ path }: { path: string }) {
	const { t } = useTranslation();
	const { release } = useMemoryFileActions();
	const [open, setOpen] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const outside = (event: Event) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("pointerdown", outside);
		return () => document.removeEventListener("pointerdown", outside);
	}, [open]);
	return (
		<div ref={root} className="relative">
			<button
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				disabled={release.isPending}
				onClick={() => setOpen(!open)}
				onKeyDown={(event) => {
					if (event.key === "Escape" && open) {
						event.preventDefault();
						event.stopPropagation();
						setOpen(false);
					}
				}}
				className="inline-flex h-[var(--control-sm)] items-center gap-[var(--spacing-1)] rounded-[var(--radius-full)] px-[var(--spacing-2)] text-caption text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
			>
				<PenLine size={12} aria-hidden />
				{t("memory.userEdited")}
			</button>
			{open ? (
				<div
					role="menu"
					className="absolute top-full right-0 z-50 mt-[var(--spacing-1)] min-w-max rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] p-[var(--spacing-1)] shadow-[var(--shadow-lg)]"
				>
					<button
						type="button"
						role="menuitem"
						onClick={() => {
							setOpen(false);
							release.mutate({ path, userEdited: false });
						}}
						className="flex w-full items-center rounded-[var(--radius-control-sm)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-start text-body text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] focus-visible:bg-[var(--color-bg-hover)]"
					>
						{t("memory.letBotRewrite")}
					</button>
				</div>
			) : null}
			{release.error ? <MemoryError error={release.error} /> : null}
		</div>
	);
}
