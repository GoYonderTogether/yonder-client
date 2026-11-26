import { Button } from "@yonder/ui-components";
import { useChannelConversations, useChannelMessages, useChannels } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function FeishuExternalConversations({ botId }: { botId: string }) {
	const { t } = useTranslation();
	const channels = useChannels();
	const connection = channels.data?.items.find(
		(item) => item.botId === botId && (item.provider ?? "feishu") === "feishu",
	);
	if (channels.isPending) return <p role="status">{t("app.loading")}</p>;
	if (channels.isError && !channels.data) {
		return (
			<div className="flex flex-wrap items-center gap-[var(--spacing-3)]">
				<p role="alert">{t("channels.failed")}</p>
				<Button size="sm" variant="link" onClick={() => void channels.refetch()}>
					{t("app.retry")}
				</Button>
			</div>
		);
	}
	return connection ? (
		<ExternalConversationList key={connection.id} connectionId={connection.id} />
	) : (
		<p className="text-caption text-[var(--color-text-secondary)]">{t("channels.disconnected")}</p>
	);
}

function ExternalConversationList({ connectionId }: { connectionId: string }) {
	const { t, i18n } = useTranslation();
	const { list, change } = useChannelConversations(connectionId);
	const [selection, select] = useState<string>();
	const items = list.data?.items ?? [];
	const current = items.find((item) => item.id === selection);
	return (
		<section className="grid gap-[var(--spacing-3)]">
			{list.isLoading && <p role="status">{t("app.loading")}</p>}
			{(list.isError || change.isError) && <p role="alert">{t("channels.failed")}</p>}
			{list.isSuccess && items.length === 0 && <p>{t("channels.noConversations")}</p>}
			{items.map((item) => (
				<Button
					key={item.id}
					aria-pressed={selection === item.id}
					onClick={() => select(selection === item.id ? undefined : item.id)}
				>
					{t(`channels.chat_${item.kind}`)} · {t(`channels.chat_${item.state}`)} ·{" "}
					{new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "short", timeStyle: "short" }).format(
						new Date(item.lastMessageAt),
					)}
				</Button>
			))}
			{current && (
				<>
					<div className="flex flex-wrap gap-[var(--spacing-2)]">
						{current.state === "pending" && (
							<>
								<Button
									disabled={change.isPending}
									onClick={() => change.mutate({ id: current.id, action: "temporary" })}
								>
									{t("channels.approveTemporary")}
								</Button>
								<Button disabled={change.isPending} onClick={() => change.mutate({ id: current.id, action: "allow" })}>
									{t("channels.approveOpen")}
								</Button>
							</>
						)}
						<Button
							disabled={change.isPending}
							onClick={() => change.mutate({ id: current.id, action: current.state === "closed" ? "reset" : "close" })}
						>
							{t(
								current.state === "closed"
									? "channels.resetChat"
									: current.state === "pending"
										? "channels.rejectChat"
										: "channels.closeChat",
							)}
						</Button>
					</div>
					<ExternalTranscript key={current.id} id={current.id} />
				</>
			)}
		</section>
	);
}

function ExternalTranscript({ id }: { id: string }) {
	const { t } = useTranslation();
	const messages = useChannelMessages(id);
	return (
		<section aria-label={t("channels.readOnly")} className="grid gap-[var(--spacing-2)]">
			<p>{t("channels.readOnly")}</p>
			{messages.isError && <p role="alert">{t("channels.failed")}</p>}
			{messages.hasNextPage && (
				<Button loading={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>
					{t("channels.olderMessages")}
				</Button>
			)}
			{messages.data?.pages
				.toReversed()
				.flatMap((page) => page.items)
				.map((item) => (
					<article
						key={item.id}
						className="min-w-0 rounded-[var(--radius-md)] border border-[var(--color-border)] p-[var(--spacing-3)]"
					>
						<strong>
							{item.name ?? t(item.sender === "bot" ? "channels.botSpeaker" : "channels.externalSpeaker")}
						</strong>
						<p className="whitespace-pre-wrap break-words">{item.text}</p>
					</article>
				))}
		</section>
	);
}
