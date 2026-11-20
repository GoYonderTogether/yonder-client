import type { ConversationMember, Member } from "@yonder/protocol";
import { cn } from "@yonder/ui-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function BotName({
	name,
	ownedBot,
	owner,
	compact,
}: {
	name: ReactNode;
	ownedBot?: Member | undefined;
	owner?: ConversationMember["botOwner"];
	compact?: "list" | "header";
}) {
	const { t } = useTranslation();
	const showOwner = owner !== undefined;
	const role = showOwner ? undefined : ownedBot?.botRoleLabel;
	const primary = !showOwner && ownedBot?.isDefault;
	const label = primary ? t("bots.mainLabel") : t("bots.aiLabel");
	const ownerText = owner ? `@${owner.displayName || owner.handle}` : t("bots.externalOwner");
	const ownerIdentity =
		owner?.displayName && owner.displayName !== owner.handle ? `${ownerText} (@${owner.handle})` : ownerText;
	return (
		<span
			data-bot-name
			className={cn(
				"min-w-0 max-w-full items-center gap-[var(--spacing-1)]",
				compact ? "flex" : "inline-flex flex-wrap align-top",
				compact === "header" && "justify-center",
			)}
		>
			<span
				data-bot-display-name
				className={
					compact
						? cn("truncate", role ? "min-w-[min(2em,100%)] max-w-max flex-[1_1_0]" : "min-w-[min(3em,100%)]")
						: "min-w-0 max-w-full wrap-anywhere"
				}
				title={typeof name === "string" ? name : undefined}
			>
				{name}
			</span>{" "}
			{showOwner ? (
				<>
					<span
						data-bot-owner
						title={ownerIdentity}
						className={cn(
							"text-caption font-normal text-[var(--color-avatar-4-fg)]",
							compact ? "min-w-[min(3.2em,100%)] truncate" : "min-w-0 max-w-full wrap-anywhere",
						)}
					>
						<span aria-hidden="true">{ownerText}</span>
						<span className="sr-only">{ownerIdentity}</span>
					</span>{" "}
				</>
			) : null}
			<span
				data-bot-label
				className={cn(
					"inline-flex h-[var(--spacing-5)] shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-full)] px-[var(--spacing-2)] text-caption font-medium",
					primary
						? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-text)]"
						: "bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]",
				)}
			>
				{label}
			</span>
			{role ? (
				<>
					{" "}
					<span
						data-bot-duty
						title={role}
						className={cn(
							"border-s border-[var(--color-border-default)] ps-[var(--spacing-1)] text-caption font-normal text-[var(--color-text-secondary)]",
							compact ? "min-w-0 truncate" : "min-w-0 max-w-full wrap-anywhere",
						)}
					>
						{role}
					</span>
				</>
			) : null}
		</span>
	);
}
