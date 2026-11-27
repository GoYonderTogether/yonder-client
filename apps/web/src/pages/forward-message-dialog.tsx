import type { Conversation } from "@yonder/protocol";
import { Button, Checkbox, ListGroup, SearchInput } from "@yonder/ui-components";
import { chatCacheGeneration, useConversations, useForwardMessage } from "@yonder/ui-data";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppNotice } from "../app/app-notice.tsx";
import { ConversationAvatar, conversationTitle } from "./conversation-presentation.tsx";

type ForwardTarget = { conversation: Conversation; clientNonce: string };

export function ForwardMessageDialog({
	messageId,
	personId,
	onClose,
}: {
	messageId: string;
	personId: string | undefined;
	onClose: () => void;
}) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const notify = useAppNotice();
	const conversations = useConversations();
	const forward = useForwardMessage();
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const [retry, setRetry] = useState<ForwardTarget[]>([]);
	const [busy, setBusy] = useState(false);
	const eligible =
		conversations.data?.items.filter(
			(item) =>
				item.kind !== "system" &&
				!item.closedReason &&
				!item.hiddenFromMessages &&
				item.visit?.role !== "host" &&
				item.visit?.state !== "denied",
		) ?? [];
	const needle = query.trim().toLowerCase();
	const visible = retry.length
		? retry.map(({ conversation }) => conversation)
		: eligible.filter((item) => conversationTitle(item, personId).toLowerCase().includes(needle));
	const chosen = eligible.filter(({ id }) => selected.includes(id));
	const dismiss = () => {
		if (!busy) onClose();
	};

	async function submit() {
		if (busy) return;
		const targets = retry.length
			? retry
			: chosen.map((conversation) => ({ conversation, clientNonce: crypto.randomUUID() }));
		if (!targets.length) return;
		const generation = chatCacheGeneration();
		setBusy(true);
		const failed: ForwardTarget[] = [];
		for (const target of targets) {
			if (generation !== chatCacheGeneration()) break;
			try {
				await forward.mutateAsync({
					messageId,
					conversationId: target.conversation.id,
					clientNonce: target.clientNonce,
				});
			} catch {
				failed.push(target);
			}
		}
		setBusy(false);
		if (generation !== chatCacheGeneration()) return onClose();
		setRetry(failed);
		notify({
			key: `message-forward-${crypto.randomUUID()}`,
			text: t("chat.forwardResult", { success: targets.length - failed.length, failed: failed.length }),
			tone: failed.length ? "warning" : "info",
		});
		if (!failed.length) onClose();
	}

	return (
		<Overlay
			open
			onClose={dismiss}
			title={t("chat.forwardTitle")}
			mode={mode}
			size="small"
			closeLabel={t("app.close")}
			mobileBackLabel={t("app.back")}
			footer={
				<>
					<Button disabled={busy} onClick={dismiss}>
						{t("app.cancel")}
					</Button>
					<Button
						variant="primary"
						loading={busy}
						disabled={!chosen.length && !retry.length}
						onClick={() => void submit()}
					>
						{t(retry.length ? "app.retry" : "chat.forward")}
					</Button>
				</>
			}
		>
			<div className="flex min-w-0 flex-col gap-[var(--spacing-4)] p-[var(--spacing-5)]">
				{!retry.length ? (
					<SearchInput
						value={query}
						aria-label={t("chat.forwardSearch")}
						placeholder={t("chat.forwardSearch")}
						onChange={(event) => setQuery(event.target.value)}
					/>
				) : null}
				{conversations.isLoading ? <p role="status">{t("app.loading")}</p> : null}
				{conversations.isError && !conversations.data ? (
					<Button variant="link" onClick={() => void conversations.refetch()}>
						{t("app.retry")}
					</Button>
				) : null}
				{conversations.isSuccess && !visible.length ? (
					<p className="text-caption text-[var(--color-text-secondary)]">
						{t(eligible.length ? "chatActions.noResults" : "chat.forwardEmpty")}
					</p>
				) : null}
				{visible.length ? (
					<ListGroup>
						{visible.map((item) => (
							<li key={item.id} className="border-b border-dashed border-[var(--color-border)] last:border-b-0">
								<Checkbox
									checked={retry.length > 0 || selected.includes(item.id)}
									disabled={busy || retry.length > 0}
									onChange={(event) =>
										setSelected(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))
									}
									className="flex items-center gap-[var(--spacing-3)] px-[var(--spacing-3)] py-[var(--spacing-2)] hover:bg-[var(--color-bg-hover)] [&>span:last-child]:min-w-0"
								>
									<span className="flex min-w-0 items-center gap-[var(--spacing-3)]">
										<ConversationAvatar conversation={item} personId={personId} />
										<span className="truncate text-body text-[var(--color-text-primary)]">
											{conversationTitle(item, personId)}
										</span>
									</span>
								</Checkbox>
							</li>
						))}
					</ListGroup>
				) : null}
			</div>
		</Overlay>
	);
}
