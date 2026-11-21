import type { Member } from "@yonder/protocol";
import { Avatar, Logo } from "@yonder/ui-components";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./me-card.css";

/**
 * Who you are, at the top of 「我」 on a phone. It is the same card shape the memory page shows
 * others, without the turn-over and the QR: here the whole face opens the profile editor, and the
 * bio is what other people read about you.
 */
export function MeCard({
	person,
	selected = false,
	onOpen,
}: {
	person: Pick<Member, "displayName" | "handle" | "avatarUrl" | "avatarColor" | "bio"> | undefined;
	selected?: boolean;
	onOpen: () => void;
}) {
	const { t } = useTranslation();
	return (
		<button
			type="button"
			className="me-card"
			aria-label={t("me.editProfile")}
			aria-current={selected ? "true" : undefined}
			onClick={onOpen}
		>
			<span className="me-card-brand">
				<Logo size={16} />
				<span>Yonder</span>
			</span>
			<span className="me-card-who">
				<Avatar
					name={person?.displayName ?? "?"}
					src={person?.avatarUrl ?? null}
					color={person?.avatarColor ?? null}
					size={64}
				/>
				<span className="min-w-0">
					<span className="me-card-name">{person?.displayName ?? t("app.loading")}</span>
					{person ? <span className="me-card-handle">@{person.handle}</span> : null}
				</span>
			</span>
			{person?.bio ? <span className="me-card-bio">{person.bio}</span> : null}
			<span className="me-card-edit" aria-hidden="true">
				{t("me.editProfile")}
				<ChevronRight size={14} />
			</span>
		</button>
	);
}
