import { cn } from "@yonder/ui-components";
import { Settings } from "lucide-react";
import type { ReactNode } from "react";
import type { TabId } from "../navigation/routes.ts";
import { TABS } from "../navigation/routes.ts";
import { TAB_ICONS } from "./tab-icons.tsx";
import { TopBar } from "./top-bar.tsx";

export interface RailProps {
	current: TabId;
	onSelect: (tab: TabId) => void;
	labels: Record<TabId, string>;
	ariaLabel: string;
	renderAvatar: (size: 32) => ReactNode;
	onOpenMe: () => void;
	meOpen: boolean;
	meLabel: string;
	settingsLabel: string;
	titlebarInset: boolean;
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
	titlebarInset,
}: RailProps) {
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
			<div className="w-full">
				<TopBar center={titlebarInset ? null : avatar} />
			</div>
			{titlebarInset ? (
				<div className="flex h-[var(--titlebar-height)] items-center justify-center">{avatar}</div>
			) : null}
			<ul className="mt-[var(--spacing-2)] flex flex-col items-center gap-[var(--spacing-1)]">
				{TABS.map((tab) => {
					const Icon = TAB_ICONS[tab];
					const selected = tab === current && !meOpen;
					return (
						<li key={tab}>
							<button
								type="button"
								onClick={() => onSelect(tab)}
								aria-current={selected ? "page" : undefined}
								className={cn(
									"flex w-14 flex-col items-center gap-[3px] rounded-[var(--radius-md)] py-[var(--spacing-2)]",
									"transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]",
									selected
										? "bg-[var(--color-bg-selected)] text-[var(--color-text-primary)]"
										: "text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]",
								)}
							>
								<Icon size={20} strokeWidth={selected ? 2.1 : 1.7} aria-hidden="true" />
								<span className="text-[10px] font-medium leading-3">{labels[tab]}</span>
							</button>
						</li>
					);
				})}
			</ul>
			<button
				type="button"
				onClick={onOpenMe}
				aria-label={settingsLabel}
				title={settingsLabel}
				aria-expanded={meOpen}
				className={cn(
					"mt-auto flex size-11 items-center justify-center rounded-[var(--radius-md)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]",
					meOpen
						? "bg-[var(--color-bg-selected)] text-[var(--color-text-primary)]"
						: "text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]",
				)}
			>
				<Settings size={20} strokeWidth={1.7} aria-hidden="true" />
			</button>
		</nav>
	);
}
