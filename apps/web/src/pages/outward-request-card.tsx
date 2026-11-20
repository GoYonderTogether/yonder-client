import type { OutwardRequestCard as Card, OutwardRequestAction } from "@yonder/protocol";
import { Button, TextArea } from "@yonder/ui-components";
import { ApiError, useOutwardActions } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function AskOwner({
	conversationId,
	messageId,
	disabled,
}: {
	conversationId: string;
	messageId: string;
	disabled: boolean;
}) {
	const { t } = useTranslation();
	const { ask } = useOutwardActions(conversationId);
	return (
		<>
			<Button
				size="sm"
				variant="link"
				disabled={disabled}
				loading={ask.isPending}
				onClick={() => ask.mutate(messageId)}
			>
				{t("visits.relayAsk")}
			</Button>
			{ask.error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{t(
						ask.error instanceof ApiError && ask.error.code === "conflict_version"
							? "visits.relayAlreadyOpen"
							: ask.error instanceof ApiError
								? ask.error.messageKey
								: "app.loadFailed",
					)}
				</p>
			) : null}
		</>
	);
}

export function OutwardRequestCard({
	card,
	conversationId,
	body,
	draft,
	canCancel,
	openLinked,
}: {
	card: Card;
	conversationId: string;
	body?: string | null;
	draft?: string | undefined;
	canCancel?: boolean;
	openLinked?: (() => void) | undefined;
}) {
	const { t } = useTranslation();
	const { act } = useOutwardActions(conversationId);
	const [reply, setReply] = useState("");
	const [confirmCancel, setConfirmCancel] = useState(false);
	const current = act.data && card.state === "open" ? act.data : card;
	const owner = current.owner;
	const pending = current.state === "open";
	const submit = (input: OutwardRequestAction) => act.mutate({ id: card.id, input });
	const stateKey =
		current.state === "answered"
			? current.decision === "approve"
				? "relayApproved"
				: "relayAnswered"
			: current.state === "expired"
				? "relayExpired"
				: current.state === "cancelled"
					? "relayCancelled"
					: current.state === "declined"
						? "relayDeclined"
						: "relayOpen";
	return (
		<section
			aria-label={t("visits.relayTitle")}
			className="flex w-full min-w-0 flex-col gap-[var(--spacing-2)] rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] p-[var(--spacing-3)]"
		>
			<p role="status" className="text-caption">
				{t(`visits.${stateKey}`)}
			</p>
			{owner ? (
				<>
					<strong>{t("visits.relayFrom", { name: owner.visitorName })}</strong>
					<p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{owner.question}</p>
					{owner.why ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{owner.why}</p> : null}
					{owner.priorReply ? (
						<p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
							{t("visits.relayPrior", { reply: owner.priorReply })}
						</p>
					) : null}
				</>
			) : body ? (
				<p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{body}</p>
			) : null}
			{pending && owner ? (
				<>
					<TextArea
						aria-label={t("visits.relayReply")}
						placeholder={t("visits.relayReply")}
						maxLength={8000}
						value={reply}
						onChange={(event) => setReply(event.target.value)}
					/>
					<div className="flex flex-wrap gap-[var(--spacing-2)]">
						{draft && draft !== reply ? (
							<Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => setReply(draft)}>
								{t("visits.relayUseDraft")}
							</Button>
						) : null}
						{reply.trim() ? (
							<Button size="sm" disabled={act.isPending} onClick={() => submit({ action: "reply", text: reply })}>
								{t("visits.relaySend")}
							</Button>
						) : (
							<Button size="sm" disabled={act.isPending} onClick={() => submit({ action: "approve" })}>
								{t("visits.relayApprove")}
							</Button>
						)}
						<Button
							size="sm"
							variant="secondary"
							disabled={act.isPending}
							onClick={() => submit({ action: "decline" })}
						>
							{t("visits.relayDecline")}
						</Button>
					</div>
				</>
			) : null}
			{pending && canCancel ? (
				confirmCancel ? (
					<div className="flex flex-wrap items-center gap-[var(--spacing-2)]">
						<span className="text-caption">{t("visits.relayCancelAsk")}</span>
						<Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => submit({ action: "cancel" })}>
							{t("visits.relayCancelConfirm")}
						</Button>
						<Button size="sm" variant="link" disabled={act.isPending} onClick={() => setConfirmCancel(false)}>
							{t("visits.relayKeep")}
						</Button>
					</div>
				) : (
					<Button size="sm" variant="link" disabled={act.isPending} onClick={() => setConfirmCancel(true)}>
						{t("visits.relayCancel")}
					</Button>
				)
			) : null}
			{openLinked ? (
				<Button size="sm" variant="link" onClick={openLinked}>
					{t(owner ? "visits.relayOpenVisit" : "visits.relayOpenMain")}
				</Button>
			) : null}
			{act.error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{t(act.error instanceof ApiError ? act.error.messageKey : "app.loadFailed")}
				</p>
			) : null}
		</section>
	);
}
