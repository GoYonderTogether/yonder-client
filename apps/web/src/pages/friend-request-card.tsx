import { Avatar, Button } from "@yonder/ui-components";
import { useFriendRequest, useFriendRequestActions, usePerson } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";
import { ActionError } from "./chat-actions/action-error.tsx";

/** Historic request state is independent of today's contact relationship. */
export function FriendRequestCard({ id, compact = false }: { id: string; compact?: boolean }) {
	const { t } = useTranslation();
	const person = usePerson();
	const query = useFriendRequest(id);
	const { accept } = useFriendRequestActions();
	const request = query.data?.request;
	const incoming = request?.recipient.id === person?.id;
	const peer = incoming ? request?.sender : request?.recipient;
	return (
		<section className="rounded-[var(--radius-card)] bg-[var(--color-bg-subtle)] p-[var(--spacing-4)]">
			{query.isPending ? <p role="status">{t("app.loading")}</p> : null}
			{query.isError ? (
				<Button variant="link" onClick={() => void query.refetch()}>
					{t("app.retry")}
				</Button>
			) : null}
			<ActionError error={query.error ?? accept.error} />
			{request && peer ? (
				<div className="flex items-center gap-[var(--spacing-3)]">
					<Avatar name={peer.displayName} src={peer.avatarUrl} kind={peer.kind} size={40} />
					<div className="min-w-0 flex-1">
						<p className="truncate text-body font-medium">{peer.displayName}</p>
						{compact ? null : (
							<p className="text-caption text-[var(--color-text-secondary)]">{t("friendRequests.title")}</p>
						)}
					</div>
					{request.status === "accepted" ? (
						<span role="status" className={compact ? "text-caption text-[var(--color-text-secondary)]" : undefined}>
							{t("friendRequests.accepted")}
						</span>
					) : incoming ? (
						<Button size="sm" loading={accept.isPending} disabled={accept.isPending} onClick={() => accept.mutate(id)}>
							{t("friendRequests.accept")}
						</Button>
					) : (
						<span role="status" className={compact ? "text-caption text-[var(--color-text-secondary)]" : undefined}>
							{t("friendRequests.sent")}
						</span>
					)}
				</div>
			) : null}
		</section>
	);
}
