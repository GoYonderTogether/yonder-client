import { Avatar, IconTile, ListGroup, ListRow } from "@yonder/ui-components";
import { useMe } from "@yonder/ui-data";
import { ListFrame } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";
import { ME_GROUPS } from "./sections.tsx";

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

	return (
		<ListFrame title={t("me.title")}>
			<div className="flex flex-col gap-[var(--spacing-5)]">
				<ListGroup>
					<ListRow
						leading={<Avatar name={person?.displayName ?? "?"} src={person?.avatarUrl} size={48} />}
						title={<span className="text-h3 font-semibold">{person?.displayName ?? t("app.loading")}</span>}
						subtitle={person ? `@${person.handle}` : undefined}
						chevron
						selected={current === "profile"}
						onClick={() => onOpen("profile")}
						aria-label={t("me.editProfile")}
					/>
				</ListGroup>

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
									title={t(`me.sections.${section.id}`)}
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
