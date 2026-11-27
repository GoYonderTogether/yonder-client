import { cn, UnreadBadge } from "@yonder/ui-components";
import type { ReactNode } from "react";
import { useId } from "react";
import { shellHaptic } from "../navigation/feedback.ts";
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
			className="relative z-20 shrink-0 material material-regular material-bar"
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
									icon: <Icon className="icon-scaled" size={24} selected={tab === current && !botTab?.active} />,
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
										data-pressable
										onClick={() => {
											if (!active) shellHaptic("selection");
											onSelect();
										}}
										aria-label={label}
										data-bot-tab={id === "bot" || undefined}
										aria-describedby={unread ? badgeId : undefined}
										aria-current={active ? "page" : undefined}
										className={cn(
											"flex size-full touch-manipulation select-none flex-col items-center justify-center gap-[var(--spacing-hair)]",
											"text-[length:var(--text-tab)] font-medium leading-[var(--text-tab--line-height)] transition-colors duration-[var(--duration-fast)]",
											"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]",
											active ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)]",
										)}
									>
										{/* A tab glyph turns from grey to its own colour; the Bot's avatar keeps its own colours,
										    so it greys out when away and gains a ring when current (native-mobile.css). */}
										<span data-press-target className="relative inline-flex items-center justify-center">
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
