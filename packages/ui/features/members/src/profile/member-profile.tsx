import type { MemberProfileResponse } from "@yonder/protocol";
import { Button, ListGroup } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";
import { MemberHeader } from "./member-header.tsx";
import { MemberRow } from "./member-row.tsx";

export interface MemberProfileProps {
	profile: MemberProfileResponse;
	/** Opens the existing or a new private chat; the caller owns what that means. */
	onMessage?: (() => void) | undefined;
	/** A person who is not a contact yet: `POST /v1/contacts`. */
	onAddContact?: (() => void) | undefined;
	/** A Bot: starting a chat with someone else's Bot is the visit flow, which the caller owns. */
	onChat?: (() => void) | undefined;
	onMatter?: (() => void) | undefined;
	/** The Bot's owner, when their own card is visible; opens it. */
	onOpenOwner?: ((handle: string) => void) | undefined;
	/** One of the person's Bots, from the list on their card (R38); opens that Bot's card. */
	onOpenBot?: ((handle: string) => void) | undefined;
	/** The anonymous form: shown only when both are given (17 3.7). */
	onSignIn?: (() => void) | undefined;
	onDownload?: (() => void) | undefined;
	/** A failure from whichever action ran, shown as the real reason. */
	error?: string | null | undefined;
	busy?: boolean | undefined;
}

/** The one action the reader came to take, and nothing else (17 第二节). */
type Action = "message" | "addContact" | "chat" | null;

function primaryAction(profile: MemberProfileResponse, has: Omit<MemberProfileProps, "profile">): Action {
	const { relation, conversationId } = profile;
	// Saying which one it is means the button cannot offer a chat with yourself.
	if (relation === "self" || relation === "own_bot") return null;
	// An open chat wins over everything: the shortest path to what the reader wants to do.
	if (relation === "contact" || conversationId) return "message";
	if (profile.card.kind === "bot") return has.onChat ? "chat" : null;
	if (relation === "none") return has.onAddContact ? "addContact" : null;
	return null;
}

/**
 * One card for a person and for a Bot (17 第二节): who they are on top, one action underneath. The
 * difference between them is only what that action is, which the server's `relation` decides; the
 * component never guesses. With no `relation` at all it is the anonymous form, which shows the card
 * and the way in, and only when the caller provides those two callbacks.
 */
export function MemberProfile({ profile, error, busy = false, ...handlers }: MemberProfileProps) {
	const { t } = useTranslation();
	const anonymous = profile.relation === undefined;
	const action = anonymous ? null : primaryAction(profile, handlers);
	const label =
		action === "message"
			? t("members.actions.message")
			: action === "addContact"
				? t("members.actions.addContact")
				: action === "chat"
					? t("members.actions.chat")
					: null;
	const run =
		action === "message"
			? handlers.onMessage
			: action === "addContact"
				? handlers.onAddContact
				: action === "chat"
					? handlers.onChat
					: undefined;

	return (
		<div className="flex min-h-0 flex-col">
			<MemberHeader card={profile.card} onOpenOwner={handlers.onOpenOwner} />
			<div className="flex flex-col gap-[var(--spacing-3)] px-[var(--spacing-5)] pb-[var(--spacing-6)]">
				{!anonymous && profile.card.kind === "person" && profile.relation !== "self" && handlers.onMatter ? (
					<Button variant="secondary" block loading={busy} onClick={handlers.onMatter}>
						{t("members.actions.matter")}
					</Button>
				) : null}
				{label && run ? (
					<Button variant="primary" block loading={busy} onClick={run}>
						{label}
					</Button>
				) : null}
				{anonymous && handlers.onSignIn ? (
					<Button variant="primary" block onClick={handlers.onSignIn}>
						{t("members.anonymous.signIn")}
					</Button>
				) : null}
				{anonymous && handlers.onDownload ? (
					<Button variant="secondary" block onClick={handlers.onDownload}>
						{t("members.anonymous.download")}
					</Button>
				) : null}
				{error ? (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{error}
					</p>
				) : null}
			</div>
			{profile.card.kind === "person" && profile.bots?.length ? (
				<div className="px-[var(--spacing-4)] pb-[var(--spacing-6)]">
					<ListGroup title={t(profile.relation === "self" ? "members.card.myBots" : "members.card.bots")}>
						{profile.bots.map((bot) => (
							<MemberRow
								key={bot.handle}
								member={{ ...bot, kind: "bot" }}
								badge={bot.reception ? t("members.card.receptionBadge") : undefined}
								onOpen={handlers.onOpenBot ? () => handlers.onOpenBot?.(bot.handle) : undefined}
							/>
						))}
					</ListGroup>
				</div>
			) : null}
		</div>
	);
}
