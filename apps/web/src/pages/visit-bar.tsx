import type { Conversation } from "@yonder/protocol";
import { Button } from "@yonder/ui-components";
import { ApiError, useFriendRequestActions, usePerson, useVisitActions } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { conversationPeer } from "./conversation-presentation.tsx";

/**
 * The strip above a conversation with someone else's Bot (19 第 2.3 节). It says the state the
 * server reports in one line and offers only the actions that state allows: the owner approves or
 * declines, and a visitor whose free allowance ran out can pay for the rest from their own quota.
 * A host never writes, so the composer is not shown at all; this is the only thing they act on.
 */
export function VisitBar({ conversation }: { conversation: Conversation }) {
	const { t } = useTranslation();
	const person = usePerson();
	const visit = conversation.visit;
	const actions = useVisitActions();
	const contacts = useFriendRequestActions();
	const [addedFor, setAddedFor] = useState<string | null>(null);
	const [hostPays, setHostPays] = useState(false);
	const [confirmPay, setConfirmPay] = useState(false);
	const added = addedFor === conversation.id;
	if (!visit) return null;
	const host = visit.role === "host";
	const visitor = host ? conversationPeer(conversation, person?.id) : undefined;
	/** The person whose Bot it is, when the server listed them: a visitor may add them as a contact. */
	const owner = host
		? undefined
		: conversation.members.find((member) => member.kind === "person" && member.memberId !== person?.id);
	const failure = actions.approve.error ?? actions.deny.error ?? actions.pay.error ?? contacts.request.error;

	const line = (() => {
		if (host)
			return visit.state === "pending" || visit.state === "capped"
				? t("visits.hostPending", { name: visitor?.displayName ?? "" })
				: null;
		switch (visit.state) {
			case "pending":
				return t("visits.visitorPending");
			case "capped":
				return t("visits.visitorCapped");
			case "denied":
				return t("visits.visitorDenied");
			default:
				// `trial` is an ordinary chat and `self_pay` is the visitor's own quota; neither needs a bar.
				return null;
		}
	})();
	if (!line) return null;

	return (
		<div className="mb-[var(--spacing-3)] flex flex-wrap items-center gap-[var(--spacing-2)] rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]">
			<span className="min-w-0 flex-1">{line}</span>
			{host && (visit.state === "pending" || visit.state === "capped") ? (
				<>
					<label>
						<input type="checkbox" checked={hostPays} onChange={(event) => setHostPays(event.target.checked)} />{" "}
						{t("visits.hostPays")}
					</label>
					<Button
						size="sm"
						variant="primary"
						loading={actions.approve.isPending}
						onClick={() => actions.approve.mutate({ visitId: visit.id, hostPays })}
					>
						{t("visits.approve")}
					</Button>
					<Button size="sm" loading={actions.deny.isPending} onClick={() => actions.deny.mutate(visit.id)}>
						{t("visits.decline")}
					</Button>
				</>
			) : null}
			{!host && visit.state === "pending" && owner ? (
				added ? (
					<span>{t("friendRequests.sent")}</span>
				) : (
					<Button
						size="sm"
						loading={contacts.request.isPending}
						onClick={() => contacts.request.mutate(owner.memberId, { onSuccess: () => setAddedFor(conversation.id) })}
					>
						{t("visits.addContact")}
					</Button>
				)
			) : null}
			{!host && visit.state === "capped" && !confirmPay ? (
				<Button size="sm" variant="primary" loading={actions.pay.isPending} onClick={() => setConfirmPay(true)}>
					{t("visits.payRest")}
				</Button>
			) : null}
			{!host && visit.state === "capped" && confirmPay ? (
				<>
					<span>{t("visits.confirmPayText")}</span>
					<Button
						size="sm"
						variant="primary"
						loading={actions.pay.isPending}
						onClick={() => actions.pay.mutate(visit.id)}
					>
						{t("visits.confirmPay")}
					</Button>
					<Button size="sm" onClick={() => setConfirmPay(false)}>
						{t("app.cancel")}
					</Button>
				</>
			) : null}
			{failure ? (
				<span role="alert" className="w-full text-caption text-[var(--color-danger)]">
					{failure instanceof ApiError ? t(failure.messageKey) : t("visits.actionFailed")}
				</span>
			) : null}
		</div>
	);
}
