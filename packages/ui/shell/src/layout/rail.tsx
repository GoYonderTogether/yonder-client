import { cn, UnreadBadge } from "@yonder/ui-components";
import { Settings } from "lucide-react";
import type { MouseEventHandler, ReactNode } from "react";
import { useId } from "react";
import type { TabId } from "../navigation/routes.ts";
import { TABS } from "../navigation/routes.ts";
import { TAB_ICONS } from "./tab-icons.tsx";

export interface RailProps {
	current: TabId;
	onSelect: (tab: TabId) => void;
	labels: Record<TabId, string>;
	ariaLabel: string;
	renderAvatar: (size: 32) => ReactNode;
	onOpenMe: MouseEventHandler<HTMLButtonElement>;
	meOpen: boolean;
	meLabel: string;
	settingsLabel: string;
	updateAction?: ReactNode;
	/** Sits right above the settings button. */
	inviteAction?: ReactNode;
	titlebarInset: boolean;
	messagesUnread?: { count: number; label: string } | undefined;
}

/** The 52px traffic-light row belongs to the rail; the avatar is above the tabs. */
export function Rail({
	current,
	onSelect,
	labels,
	ariaLabel,
	renderAvatar,
	onOpenMe,
	meOpen,
	meLabel,
	settingsLabel,
	updateAction,
	inviteAction,
	titlebarInset,
	messagesUnread,
}: RailProps) {
	const badgeId = useId();
	const avatar = (
		<button
			type="button"
			onClick={onOpenMe}
			aria-label={meLabel}
			aria-expanded={meOpen}
			className={cn(
				"flex items-center justify-center rounded-full p-[3px] transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]",
				meOpen ? "bg-[var(--color-bg-selected)]" : "hover:bg-[var(--color-bg-hover)]",
			)}
		>
			{renderAvatar(32)}
		</button>
	);

	return (
		<nav
			aria-label={ariaLabel}
			className="flex h-full w-[var(--rail-width)] shrink-0 flex-col items-center pb-[var(--spacing-4)]"
		>
			<header
				data-tauri-drag-region
				className="flex h-[var(--titlebar-height)] w-full shrink-0 items-center justify-center"
			>
				{titlebarInset ? null : avatar}
			</header>
			{titlebarInset ? (
				<div className="flex h-[var(--titlebar-height)] items-center justify-center">{avatar}</div>
			) : null}
			<ul className="mt-[var(--spacing-2)] flex flex-col items-center gap-[var(--spacing-1)]">
				{TABS.map((tab) => {
					const Icon = TAB_ICONS[tab];
					const selected = tab === current && !meOpen;
					const unread = tab === "messages" && messagesUnread?.count ? messagesUnread : undefined;
					return (
						<li key={tab}>
							<button
								type="button"
								onClick={() => onSelect(tab)}
								aria-label={labels[tab]}
								aria-current={selected ? "page" : undefined}
								aria-describedby={unread ? badgeId : undefined}
								className={cn(
									"flex w-14 flex-col items-center gap-[var(--spacing-hair)] rounded-[var(--radius-control)] py-[var(--spacing-2)]",
									"transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]",
									selected
										? "bg-[var(--color-bg-selected)] text-[var(--color-text-primary)]"
										: "text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]",
								)}
							>
								<span className="relative">
									<Icon className="icon-scaled" size={20} strokeWidth={selected ? 2.1 : 1.7} aria-hidden="true" />
									{unread ? (
										<UnreadBadge
											{...unread}
											id={badgeId}
											dot
											className="absolute -end-[var(--spacing-2)] -top-[var(--spacing-1)]"
										/>
									) : null}
								</span>
								<span className="text-[length:var(--text-tab)] font-medium leading-[var(--text-tab--line-height)]">
									{labels[tab]}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
			<div className="mt-auto flex flex-col items-center gap-[var(--spacing-2)]">
				{updateAction}
				{inviteAction}
				<button
					type="button"
					onClick={onOpenMe}
					aria-label={settingsLabel}
					title={settingsLabel}
					aria-expanded={meOpen}
					className={cn(
						"flex size-[var(--control-md)] items-center justify-center rounded-[var(--radius-control)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]",
						meOpen
							? "bg-[var(--color-bg-selected)] text-[var(--color-text-primary)]"
							: "text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]",
					)}
				>
					<Settings className="icon-scaled" size={20} strokeWidth={1.7} aria-hidden="true" />
				</button>
			</div>
		</nav>
	);
}
