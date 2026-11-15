import { cn } from "@yonder/ui-components";
import type { ReactNode } from "react";
import type { TabId } from "../navigation/routes.ts";
import { TABS } from "../navigation/routes.ts";
import { TAB_ICONS } from "./tab-icons.tsx";

export interface MobileDockProps {
	/** The composer, or nothing (「我」 and its settings have none). */
	composer: ReactNode | null;
	/** The tab bar is hidden while a detail is pushed; the composer stays. */
	showTabs: boolean;
	current: TabId;
	onSelect: (tab: TabId) => void;
	labels: Record<TabId, string>;
	ariaLabel: string;
}

/**
 * The phone's bottom container: composer above, tabs below, one translucent surface. It stays
 * mounted while the tabs change, so a half-typed message survives a tab switch (11 第三节第 2 条).
 */
export function MobileDock({ composer, showTabs, current, onSelect, labels, ariaLabel }: MobileDockProps) {
	if (!composer && !showTabs)
		return <div className="shrink-0" style={{ height: "var(--dock-bottom-inset, env(safe-area-inset-bottom))" }} />;
	return (
		<div
			className="relative z-20 shrink-0 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-dock)] backdrop-blur-xl backdrop-saturate-150"
			style={{ paddingBottom: "var(--dock-bottom-inset, env(safe-area-inset-bottom))" }}
		>
			{composer ? (
				<div className={cn("px-[var(--spacing-3)] pt-[var(--spacing-2)]", !showTabs && "pb-[var(--spacing-2)]")}>
					{composer}
				</div>
			) : null}
			{showTabs ? (
				<nav aria-label={ariaLabel}>
					<ul className="flex h-[var(--tabbar-height)] items-stretch">
						{TABS.map((tab) => {
							const selected = tab === current;
							const Icon = TAB_ICONS[tab];
							return (
								<li key={tab} className="flex-1">
									<button
										type="button"
										onClick={() => onSelect(tab)}
										aria-current={selected ? "page" : undefined}
										className={cn(
											"flex size-full flex-col items-center justify-center gap-[3px]",
											"text-[10px] font-medium leading-3 transition-colors duration-[var(--duration-fast)]",
											"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]",
											selected ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)]",
										)}
									>
										<Icon size={23} strokeWidth={selected ? 2.1 : 1.6} aria-hidden="true" />
										<span>{labels[tab]}</span>
									</button>
								</li>
							);
						})}
					</ul>
				</nav>
			) : null}
		</div>
	);
}
