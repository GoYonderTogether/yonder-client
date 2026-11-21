import type { Member } from "@yonder/protocol";
import { useEffect, useId, useRef } from "react";
import { Avatar } from "../avatar/avatar.tsx";
import { cn } from "../cn.ts";

type BotOption = Pick<Member, "id" | "handle" | "displayName" | "avatarUrl" | "avatarColor" | "botRoleLabel">;

export function BotSelector({
	bots,
	selectedBotId,
	onSelectBot,
	label,
	disabled = false,
}: {
	bots: readonly BotOption[];
	selectedBotId: string;
	onSelectBot: (id: string) => void;
	label: string;
	disabled?: boolean;
}) {
	const name = useId();
	const strip = useRef<HTMLDivElement>(null);
	const selectedIndex = bots.findIndex((bot) => bot.id === selectedBotId);

	useEffect(() => {
		const scroller = strip.current;
		const selected = scroller?.children[selectedIndex];
		if (!scroller || !selected) return;
		const viewport = scroller.getBoundingClientRect();
		const item = selected.getBoundingClientRect();
		const offset = item.left < viewport.left ? item.left - viewport.left : Math.max(0, item.right - viewport.right);
		if (offset) scroller.scrollBy({ left: offset });
	}, [selectedIndex]);

	return (
		<fieldset className="min-w-0">
			<legend className="mb-[var(--spacing-1)] px-[var(--spacing-1)] text-caption font-medium text-[var(--color-text-secondary)]">
				{label}
			</legend>
			<div ref={strip} className="flex max-w-full gap-[var(--spacing-1)] overflow-x-auto">
				{bots.map((bot) => (
					<label
						key={bot.id}
						title={bot.botRoleLabel ? `${bot.displayName} · ${bot.botRoleLabel}` : bot.displayName}
						className={cn(
							"group relative w-[calc(var(--spacing-16)*2+var(--spacing-8))] max-w-full shrink-0",
							disabled ? "cursor-default" : "cursor-pointer",
						)}
					>
						<input
							type="radio"
							name={name}
							value={bot.id}
							aria-label={bot.displayName}
							aria-describedby={`${name}-${bot.id}`}
							aria-disabled={disabled || undefined}
							checked={bot.id === selectedBotId}
							onChange={() => {
								if (!disabled) onSelectBot(bot.id);
							}}
							className="peer absolute inset-0 size-full cursor-inherit opacity-0"
						/>
						<span
							className={cn(
								"flex h-[var(--conversation-row-height)] items-center gap-[var(--spacing-2)] rounded-[var(--radius-control)] px-[var(--spacing-2)] transition-colors duration-[var(--duration-fast)]",
								"peer-focus-visible:outline-2 peer-focus-visible:outline-offset-[-2px] peer-focus-visible:outline-[var(--color-accent)]",
								bot.id === selectedBotId
									? "bg-[var(--color-bg-selected)]"
									: !disabled && "group-hover:bg-[var(--color-bg-hover)] group-active:bg-[var(--color-bg-active)]",
							)}
						>
							<Avatar name={bot.displayName} src={bot.avatarUrl} kind="bot" size={40} color={bot.avatarColor} />
							<span className="flex min-w-0 flex-col">
								<span className="truncate text-body font-medium text-[var(--color-text-primary)]">
									{bot.displayName}
								</span>
								<span id={`${name}-${bot.id}`} className="truncate text-caption text-[var(--color-text-secondary)]">
									{bot.botRoleLabel || `@${bot.handle}`}
								</span>
							</span>
						</span>
					</label>
				))}
			</div>
		</fieldset>
	);
}
