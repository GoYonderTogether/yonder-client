import { Avatar, cn, IconTile, ListGroup, ListRow } from "@yonder/ui-components";
import { useMe } from "@yonder/ui-data";
import { ListFrame, useShellChrome } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";
import { MeCard } from "../components/me-card.tsx";
import { ME_GROUPS, sectionLabelKey } from "./sections.tsx";

const SIDEBAR_ROW =
	"flex min-h-[var(--control-sm)] w-full items-center gap-[var(--spacing-3)] rounded-[var(--radius-control-sm)] px-[var(--spacing-3)] py-[var(--spacing-1)] text-start text-body text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]";

export interface MeListProps {
	/** The section open on the right on desktop; highlighted in the list. */
	current: string | null;
	onOpen: (section: string) => void;
}

/**
 * The 「我」 list: who you are at the top, then the grouped settings — the shape of WeChat's
 * 「我」 on a phone and of macOS System Settings on a desktop (11 第六节).
 */
export function MeList({ current, onOpen }: MeListProps) {
	const { t } = useTranslation();
	const me = useMe();
	const person = me.data?.member;
	const { mode, desktop } = useShellChrome();

	if (mode !== "mobile") {
		return (
			<ListFrame title={t("me.title")}>
				<nav aria-label={t("me.title")} className="flex flex-col gap-[var(--spacing-5)]">
					<button
						type="button"
						aria-label={t("me.editProfile")}
						aria-current={current === "profile" ? "page" : undefined}
						className={cn(
							SIDEBAR_ROW,
							current === "profile" ? "bg-[var(--color-bg-selected)]" : "hover:bg-[var(--color-bg-hover)]",
						)}
						onClick={() => onOpen("profile")}
					>
						<Avatar name={person?.displayName ?? "?"} src={person?.avatarUrl} size={32} />
						<span className="flex min-w-0 flex-col">
							<span className="truncate font-medium">{person?.displayName ?? t("app.loading")}</span>
							{person ? (
								<span className="truncate text-caption text-[var(--color-text-secondary)]">@{person.handle}</span>
							) : null}
						</span>
					</button>
					{ME_GROUPS.map((group) => (
						<section key={group.id} className="flex flex-col gap-[var(--spacing-1)]">
							<h3 className="px-[var(--spacing-3)] pb-[var(--spacing-1)] text-caption text-[var(--color-text-tertiary)]">
								{t(`me.groups.${group.id}`)}
							</h3>
							<ul className="flex flex-col gap-[var(--spacing-1)]">
								{group.sections.map((section) => {
									const Icon = section.icon;
									return (
										<li key={section.id}>
											<button
												type="button"
												aria-current={current === section.id ? "page" : undefined}
												className={cn(
													SIDEBAR_ROW,
													current === section.id ? "bg-[var(--color-bg-selected)]" : "hover:bg-[var(--color-bg-hover)]",
												)}
												onClick={() => onOpen(section.id)}
											>
												<Icon
													size={16}
													strokeWidth={1.6}
													aria-hidden="true"
													className="shrink-0 text-[var(--color-text-secondary)]"
												/>
												<span className="truncate">{t(sectionLabelKey(section))}</span>
											</button>
										</li>
									);
								})}
							</ul>
						</section>
					))}
				</nav>
			</ListFrame>
		);
	}

	return (
		<ListFrame title={t("me.title")} standaloneAction={!desktop}>
			<div className="flex flex-col gap-[var(--spacing-5)]">
				<MeCard person={person} selected={current === "profile"} onOpen={() => onOpen("profile")} />

				{ME_GROUPS.map((group) => (
					<ListGroup key={group.id} title={t(`me.groups.${group.id}`)}>
						{group.sections.map((section) => {
							const Icon = section.icon;
							return (
								<ListRow
									key={section.id}
									leading={
										<IconTile>
											<Icon size={17} strokeWidth={1.8} />
										</IconTile>
									}
									title={t(sectionLabelKey(section))}
									chevron
									selected={current === section.id}
									onClick={() => onOpen(section.id)}
								/>
							);
						})}
					</ListGroup>
				))}
			</div>
		</ListFrame>
	);
}
