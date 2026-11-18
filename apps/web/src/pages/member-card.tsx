import { MemberProfile, memberFailureText } from "@yonder/feature-members";
import { Button, EmptyState, IconButton } from "@yonder/ui-components";
import {
	ApiError,
	useContactActions,
	useFriendRequestActions,
	useMemberProfile,
	usePublicMemberProfile,
	useStartBotChat,
} from "@yonder/ui-data";
import { Settings } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/** What a card can lead to; each caller owns what "open" and "go back" mean for it. */
export interface MemberCardHandlers {
	onOpenConversation: (conversationId: string) => void;
	onOpenOwner: (handle: string) => void;
	/** Only on your own card: the three privacy switches (19 第四节). */
	onOpenPrivacy: () => void;
	/** Where a card that does not exist leads. */
	onHome: () => void;
}

/** The one neutral answer for "no such handle" and "closed to you" alike (19 4.2). */
export function CardNotFound({ onHome }: { onHome: () => void }) {
	const { t } = useTranslation();
	return (
		<EmptyState
			title={t("notFound.title")}
			action={
				<Button variant="primary" onClick={onHome}>
					{t("notFound.goHome")}
				</Button>
			}
		/>
	);
}

function Loading() {
	const { t } = useTranslation();
	return (
		<p
			role="status"
			className="px-[var(--spacing-5)] py-[var(--spacing-6)] text-caption text-[var(--color-text-tertiary)]"
		>
			{t("app.loading")}
		</p>
	);
}

function LoadFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col items-center gap-[var(--spacing-2)] px-[var(--spacing-5)] py-[var(--spacing-6)]">
			<p role="alert" className="text-caption text-[var(--color-danger)]">
				{memberFailureText(error, t)}
			</p>
			<Button variant="secondary" onClick={onRetry}>
				{t("app.retry")}
			</Button>
		</div>
	);
}

/** A 404 is the only answer for "no such handle" and "not for you"; there is no second question to ask. */
export function isCardNotFound(error: unknown): boolean {
	return error instanceof ApiError && error.status === 404;
}

/**
 * The card a signed-in reader opens at `/@handle`: who this is, and the one thing they came to do
 * (17 3.4, 3.6). An existing chat opens directly; a person with no chat yet goes through the
 * contact flow, which answers with the conversation it created; someone else's Bot starts through
 * the visit flow the server owns (19 第二节).
 */
export function MemberCardView({ handle, ...handlers }: MemberCardHandlers & { handle: string }) {
	const { t } = useTranslation();
	const profile = useMemberProfile(handle);
	const contacts = useContactActions();
	const requests = useFriendRequestActions();
	const [sent, setSent] = useState(false);
	const startChat = useStartBotChat();
	const [failure, setFailure] = useState<string | null>(null);
	const fail = (error: unknown) => setFailure(memberFailureText(error, t));

	if (profile.isLoading) return <Loading />;
	if (isCardNotFound(profile.error)) return <CardNotFound onHome={handlers.onHome} />;
	if (!profile.data)
		return (
			<LoadFailure
				error={profile.error}
				onRetry={() => {
					void profile.refetch();
				}}
			/>
		);
	const { card, relation, memberId, conversationId } = profile.data;
	const self = relation === "self";

	const message = () => {
		setFailure(null);
		if (conversationId) return handlers.onOpenConversation(conversationId);
		// A person with no chat yet: adding them is what creates it, and the server answers with it.
		if (!memberId) return;
		contacts.addContact.mutate(memberId, {
			onSuccess: ({ conversation }) => handlers.onOpenConversation(conversation.id),
			onError: fail,
		});
	};
	const add = () => {
		setFailure(null);
		if (!memberId) return;
		requests.request.mutate(memberId, { onSuccess: () => setSent(true), onError: fail });
	};
	const chat = () => {
		setFailure(null);
		startChat.mutate(handle, {
			onSuccess: ({ conversation }) => handlers.onOpenConversation(conversation.id),
			onError: fail,
		});
	};

	const reception = profile.data.bots?.find((bot) => bot.reception);
	const matter = () => {
		if (!reception) return;
		setFailure(null);
		startChat.mutate(reception.handle, {
			onSuccess: ({ conversation }) => handlers.onOpenConversation(conversation.id),
			onError: fail,
		});
	};

	return (
		<div className="flex flex-col">
			{self ? (
				<div className="flex justify-end px-[var(--spacing-5)] pt-[var(--spacing-2)]">
					<IconButton
						aria-label={t("members.privacy.title")}
						title={t("members.privacy.title")}
						onClick={handlers.onOpenPrivacy}
					>
						<Settings size={18} strokeWidth={1.8} aria-hidden="true" />
					</IconButton>
				</div>
			) : null}
			{sent ? <p role="status">{t("friendRequests.sent")}</p> : null}
			<MemberProfile
				profile={profile.data}
				{...(self ? {} : { onMessage: message })}
				{...(card.kind === "bot" ? { onChat: chat } : { onAddContact: sent ? undefined : add })}
				{...(reception ? { onMatter: matter } : {})}
				onOpenOwner={handlers.onOpenOwner}
				error={failure}
				busy={contacts.addContact.isPending || startChat.isPending || requests.request.isPending}
			/>
		</div>
	);
}

/**
 * The same card for a reader who is not signed in (17 3.7): the four things a card shows, the way
 * in, and the download. Nothing here acts on the server, so nothing can fail but the read itself.
 */
export function PublicMemberCard({
	handle,
	onSignIn,
	onDownload,
	onHome,
}: {
	handle: string;
	onSignIn: () => void;
	onDownload: () => void;
	onHome: () => void;
}) {
	const profile = usePublicMemberProfile(handle);
	if (profile.isLoading) return <Loading />;
	if (isCardNotFound(profile.error)) return <CardNotFound onHome={onHome} />;
	if (!profile.data)
		return (
			<LoadFailure
				error={profile.error}
				onRetry={() => {
					void profile.refetch();
				}}
			/>
		);
	return <MemberProfile profile={profile.data} onSignIn={onSignIn} onDownload={onDownload} />;
}
