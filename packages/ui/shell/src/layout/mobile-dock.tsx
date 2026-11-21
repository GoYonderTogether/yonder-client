import { cn, UnreadBadge } from "@yonder/ui-components";
import type { ReactNode } from "react";
import { useId } from "react";
import type { TabId } from "../navigation/routes.ts";
import { MOBILE_TABS } from "../navigation/routes.ts";
import { TAB_ICONS } from "./tab-icons.tsx";
import { useChromeSize } from "./use-chrome-size.ts";

export interface MobileDockProps {
	/** The composer, or nothing (「我」 and its settings have none). */
	composer: ReactNode | null;
	/** The tab bar is hidden while a detail is pushed; the composer stays. */
	showTabs: boolean;
	current: TabId;
	onSelect: (tab: TabId) => void;
	labels: Record<TabId, string>;
	ariaLabel: string;
	botTab?: { label: string; active: boolean; icon: ReactNode; onSelect(): void } | undefined;
	messagesUnread?: { count: number; label: string } | undefined;
	onHeightChange?: (height: number) => void;
}

/**
 * The phone's bottom container: composer above, tabs below, one translucent surface. It stays
 * mounted while the tabs change, so a half-typed message survives a tab switch (11 第三节第 2 条).
 */
export function MobileDock({
	composer,
	showTabs,
	current,
	onSelect,
	labels,
	ariaLabel,
	botTab,
	messagesUnread,
	onHeightChange,
}: MobileDockProps) {
	const ref = useChromeSize("--native-dock-height", true, onHeightChange);
	const badgeId = useId();
	if (!composer && !showTabs)
		return (
			<div
				data-mobile-dock
				ref={ref}
				className="shrink-0"
				style={{ height: "var(--dock-bottom-inset, var(--safe-area-bottom, env(safe-area-inset-bottom)))" }}
			/>
		);
	return (
		<div
			data-mobile-dock
			ref={ref}
			className="relative z-20 shrink-0 bg-[var(--color-bg-dock)] backdrop-blur-xl backdrop-saturate-150"
			style={{ paddingBottom: "var(--dock-bottom-inset, var(--safe-area-bottom, env(safe-area-inset-bottom)))" }}
		>
			{composer ? (
				<div className={cn("px-[var(--spacing-3)] pt-[var(--spacing-2)]", !showTabs && "pb-[var(--spacing-2)]")}>
					{composer}
				</div>
			) : null}
			{showTabs ? (
				<nav aria-label={ariaLabel}>
					<ul className="flex h-[var(--tabbar-height)] items-stretch">
						{[
							...(botTab ? [{ id: "bot", ...botTab, displayLabel: shortTabLabel(botTab.label) }] : []),
							...MOBILE_TABS.map((tab) => {
								const Icon = TAB_ICONS[tab];
								return {
									id: tab,
									label: labels[tab],
									displayLabel: labels[tab],
									active: tab === current && !botTab?.active,
									icon: (
										<Icon size={23} strokeWidth={tab === current && !botTab?.active ? 2.1 : 1.6} aria-hidden="true" />
									),
									onSelect: () => onSelect(tab),
								};
							}),
						].map(({ id, label, displayLabel, active, icon, onSelect }) => {
							const unread = id === "messages" && messagesUnread?.count ? messagesUnread : undefined;
							return (
								<li
									key={id}
									className={cn("min-w-0 flex-1", id === "bot" && "min-w-[calc(var(--spacing-10)+var(--spacing-3))]")}
								>
									<button
										type="button"
										onClick={onSelect}
										aria-label={label}
										aria-describedby={unread ? badgeId : undefined}
										aria-current={active ? "page" : undefined}
										className={cn(
											"flex size-full flex-col items-center justify-center gap-[3px]",
											"text-[10px] font-medium leading-3 transition-colors duration-[var(--duration-fast)]",
											"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]",
											active ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)]",
										)}
									>
										<span className="relative">
											{icon}
											{unread ? (
												<UnreadBadge
													{...unread}
													id={badgeId}
													dot
													className="absolute -end-[var(--spacing-2)] -top-[var(--spacing-1)]"
												/>
											) : null}
										</span>
										<span className="max-w-full truncate px-[var(--spacing-1)]">{displayLabel}</span>
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

function shortTabLabel(label: string) {
	const chars =
		typeof Intl.Segmenter === "function"
			? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(label), ({ segment }) => segment)
			: Array.from(label);
	return chars.length > 6 ? `${chars.slice(0, 6).join("")}…` : label;
}
