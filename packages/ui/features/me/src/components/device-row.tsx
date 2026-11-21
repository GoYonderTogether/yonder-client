import { Globe, Laptop, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function DeviceRow({
	name,
	systemName,
	platform,
	showPlatform = true,
	current,
	status,
	lastSeenAt,
	children,
}: {
	name: string;
	systemName?: string | undefined;
	platform: string;
	showPlatform?: boolean;
	current: boolean;
	status?: "online" | "offline" | undefined;
	lastSeenAt?: string;
	children?: ReactNode;
}) {
	const { t, i18n } = useTranslation();
	const Icon = platform === "web" ? Globe : /ios|android/.test(platform) ? Smartphone : Laptop;
	const detail = [
		systemName,
		showPlatform ? t(`me.devices.platforms.${platform}`, { defaultValue: platform }) : undefined,
		status ? t(`me.devices.${status}`) : undefined,
		lastSeenAt
			? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
					dateStyle: "medium",
					timeStyle: "short",
				}).format(new Date(lastSeenAt))
			: undefined,
	]
		.filter(Boolean)
		.join(" · ");
	return (
		<li className="group/row relative flex min-h-[var(--row-height)] items-center gap-[var(--spacing-3)] px-[var(--spacing-4)] py-[var(--spacing-2)]">
			<Icon size={18} strokeWidth={1.7} className="shrink-0 text-[var(--color-text-tertiary)]" aria-hidden />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="flex items-baseline gap-[var(--spacing-2)] text-body text-[var(--color-text-primary)]">
					<span className="truncate" title={name}>
						{name}
					</span>
					{current ? (
						<span className="shrink-0 text-micro text-[var(--color-accent-text)]">
							{t("me.account.sessionCurrent")}
						</span>
					) : null}
				</span>
				<span className="wrap-anywhere text-caption text-[var(--color-text-tertiary)]">{detail}</span>
			</span>
			{children}
			<span className="pointer-events-none absolute end-0 bottom-0 start-[var(--spacing-4)] h-px bg-[var(--color-border-subtle)] group-last/row:hidden" />
		</li>
	);
}
