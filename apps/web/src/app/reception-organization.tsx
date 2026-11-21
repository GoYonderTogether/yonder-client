import { memberFailureText } from "@yonder/feature-members";
import type { MemoryOrganizationPlan } from "@yonder/protocol";
import { Button, EmptyState } from "@yonder/ui-components";
import {
	ApiError,
	useBot,
	useConversations,
	useMemoryOrganization,
	useMessages,
	usePerson,
	useReviewMemoryOrganization,
	useSendMessage,
} from "@yonder/ui-data";
import { MAIN_CONVERSATION, PageFrame } from "@yonder/ui-shell";
import { FolderTree, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { primaryConversation } from "../pages/conversation-presentation.tsx";
import { type OrganizationSelection, ReceptionOrganizationTree } from "./reception-organization-tree.tsx";

const MAIN_CHAT = `/messages/${MAIN_CONVERSATION}`;

export function ReceptionOrganization({ onOpen }: { onOpen: (path: string) => void }) {
	const { t } = useTranslation();
	const person = usePerson();
	const bot = useBot();
	const conversations = useConversations();
	const candidate = primaryConversation(conversations.data?.items, bot?.id);
	const primary =
		candidate?.kind === "direct" &&
		candidate.members.length === 2 &&
		candidate.members.some(({ memberId }) => memberId === bot?.id) &&
		candidate.members.some(({ memberId }) => memberId === person?.id)
			? candidate
			: undefined;
	const send = useSendMessage(primary?.id ?? null, person?.id);
	const request = send.data?.message;
	const history = useMessages(request?.conversationId ?? null, true);
	const status =
		history.data?.pages.flatMap((page) => page.items).find((message) => message.run?.userMessageId === request?.id)?.run
			?.status ?? request?.run?.status;
	const finished = status === "completed" || status === "failed" || status === "cancelled";
	const { data, isPending, isError, refetch } = useMemoryOrganization(Boolean(request && !finished));
	const plan = data?.plan;
	const review = useReviewMemoryOrganization();
	const [applied, setApplied] = useState(0);
	const running = send.isPending || Boolean(request && !finished);
	useEffect(() => {
		if (finished) void refetch();
	}, [finished, refetch]);

	if (plan) {
		return (
			<ReceptionOrganizationReview
				key={plan.id}
				plan={plan}
				review={review}
				onReviewed={(count) => {
					setApplied(count);
					send.reset();
				}}
			/>
		);
	}
	return (
		<PageFrame title={t("members.social.organization.title")}>
			{isPending ? (
				<p role="status">{t("app.loading")}</p>
			) : isError ? (
				<div className="flex flex-wrap items-center gap-[var(--spacing-2)]">
					<p role="alert">{t("app.loadFailed")}</p>
					<Button size="sm" variant="link" onClick={() => void refetch()}>
						{t("app.retry")}
					</Button>
				</div>
			) : (
				<div className="flex flex-col gap-[var(--spacing-4)]">
					<EmptyState
						icon={<FolderTree size={24} aria-hidden />}
						title={t("members.social.organization.empty")}
						action={
							<Button
								variant="primary"
								disabled={!primary || !person || running}
								loading={send.isPending}
								onClick={() => {
									setApplied(0);
									send.mutate({
										type: "text",
										body: t("members.social.organization.request"),
										clientNonce: (send.isError ? send.variables?.clientNonce : undefined) ?? crypto.randomUUID(),
									});
								}}
							>
								<Sparkles size={16} aria-hidden />
								{t("members.social.organization.start")}
							</Button>
						}
					/>
					{applied ? (
						<p role="status" className="text-caption text-[var(--color-text-secondary)]">
							{t("members.social.organization.applied", { count: applied })}
						</p>
					) : null}
					{request ? (
						<div className="flex flex-wrap items-center gap-[var(--spacing-2)]">
							<p role="status" className="text-caption text-[var(--color-text-secondary)]">
								{t(running ? "members.social.organization.waiting" : "members.social.organization.noProposal")}
							</p>
							<Button size="sm" variant="link" onClick={() => onOpen(MAIN_CHAT)}>
								{t("members.social.organization.openChat")}
							</Button>
						</div>
					) : null}
					{send.isError || (!primary && !conversations.isPending) ? (
						<p role="alert" className="text-caption text-[var(--color-danger)]">
							{memberFailureText(send.error, t) || t("members.social.organization.chatUnavailable")}
						</p>
					) : null}
				</div>
			)}
		</PageFrame>
	);
}

function ReceptionOrganizationReview({
	plan,
	review,
	onReviewed,
}: {
	plan: MemoryOrganizationPlan;
	review: ReturnType<typeof useReviewMemoryOrganization>;
	onReviewed: (count: number) => void;
}) {
	const { t } = useTranslation();
	const [selection, setSelection] = useState<OrganizationSelection>(() => ({
		excluded: new Set(),
		destinations: new Map(),
	}));
	const chosen = plan.moves
		.filter((move) => !selection.excluded.has(move.fileId))
		.map(({ fileId, to }) => ({
			fileId,
			to: selection.destinations.get(fileId) ?? to,
		}));
	const error = review.variables?.planId === plan.id ? review.error : null;
	const stale = error instanceof ApiError && error.code === "conflict_version";
	const duplicate = new Set(chosen.map((move) => move.to)).size !== chosen.length;
	function submit(moves: typeof chosen) {
		review.mutate({ planId: plan.id, moves }, { onSuccess: () => onReviewed(moves.length) });
	}
	return (
		<PageFrame
			title={t("members.social.organization.preview")}
			afterTopBar={
				<div className="mx-auto flex w-full max-w-[var(--width-reading)] flex-wrap items-center justify-between gap-[var(--spacing-2)] border-b border-[var(--color-border-subtle)] px-[var(--spacing-4)] py-[var(--spacing-2)]">
					<p className="text-caption text-[var(--color-text-secondary)]" aria-live="polite">
						{t("members.social.organization.selection", { count: chosen.length, total: plan.moves.length })}
					</p>
					<div className="flex flex-wrap gap-[var(--spacing-2)]">
						<Button size="sm" variant="ghost" disabled={review.isPending} onClick={() => submit([])}>
							{t("members.social.organization.dismiss")}
						</Button>
						<Button
							size="sm"
							variant="primary"
							loading={review.isPending}
							disabled={!chosen.length || stale || duplicate}
							onClick={() => submit(chosen)}
						>
							{t("members.social.organization.apply")}
						</Button>
					</div>
					{duplicate || error ? (
						<p role="alert" className="basis-full text-caption text-[var(--color-danger)]">
							{duplicate
								? t("members.social.organization.duplicate")
								: stale
									? t("members.social.organization.stale")
									: memberFailureText(error, t)}
						</p>
					) : null}
				</div>
			}
		>
			<div className="flex min-w-0 flex-col gap-[var(--spacing-4)]">
				<p className="text-caption text-[var(--color-text-secondary)]">{t("members.social.organization.visibility")}</p>
				<ReceptionOrganizationTree
					moves={plan.moves}
					selection={selection}
					onChange={(next) => {
						setSelection(next);
						if (review.isError) review.reset();
					}}
					disabled={review.isPending}
				/>
			</div>
		</PageFrame>
	);
}
