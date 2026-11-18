import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@yonder/ui-components";
import { ownedBots, useApi, useContacts, usePerson } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function SocialSettings() {
	const { t } = useTranslation();
	const api = useApi();
	const client = useQueryClient();
	const person = usePerson();
	const contacts = useContacts();
	const bots = ownedBots(contacts.data?.items, person?.id);
	const [botId, setBotId] = useState("");
	const [edit, setEdit] = useState<string | null>(null);
	const data = useQuery({ queryKey: ["social-knowledge"], queryFn: () => api.socialKnowledge() });
	const save = useMutation({
		mutationFn: (value: string) => api.saveSocialKnowledge(value),
		onSuccess: (value) => {
			client.setQueryData(["social-knowledge"], value);
			setEdit(null);
		},
	});
	const draft = useMutation({
		mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api.socialDraft(id, approve),
		onSuccess: (value) => client.setQueryData(["social-knowledge"], value),
	});
	return (
		<section className="flex flex-col gap-[var(--spacing-3)] py-[var(--spacing-4)]">
			<h2>{t("members.social.title")}</h2>
			{data.isLoading ? (
				<p role="status">{t("app.loading")}</p>
			) : data.data ? (
				<>
					<label className="flex flex-col gap-[var(--spacing-2)]">
						{t("members.social.approved")}
						<textarea
							rows={6}
							className="rounded-[var(--radius-control-sm)] bg-[var(--color-bg-subtle)] p-[var(--spacing-2)]"
							value={edit ?? data.data.approved}
							maxLength={20000}
							onChange={(event) => setEdit(event.target.value)}
						/>
					</label>
					<Button disabled={edit === null} loading={save.isPending} onClick={() => save.mutate(edit ?? "")}>
						{t("members.social.save")}
					</Button>
					{data.data.drafts.map((item) => (
						<div key={item.id} className="flex flex-col gap-[var(--spacing-2)]">
							<p>{t("members.social.draft")}</p>
							<p className="whitespace-pre-wrap">{item.content}</p>
							<div className="flex gap-[var(--spacing-2)]">
								<Button
									disabled={edit !== null || draft.isPending}
									onClick={() => draft.mutate({ id: item.id, approve: true })}
								>
									{t("members.social.approve")}
								</Button>
								<Button disabled={draft.isPending} onClick={() => draft.mutate({ id: item.id, approve: false })}>
									{t("members.social.discard")}
								</Button>
							</div>
						</div>
					))}
				</>
			) : (
				<p role="alert">{t("members.errors.unknown")}</p>
			)}
			{save.isError || draft.isError ? <p role="alert">{t("members.errors.unknown")}</p> : null}
			<label className="flex flex-col gap-[var(--spacing-2)]">
				{t("members.social.chooseBot")}
				<select
					value={botId}
					onChange={(event) => setBotId(event.target.value)}
					className="bg-[var(--color-bg-subtle)] p-[var(--spacing-2)]"
				>
					<option value="">{t("members.social.chooseBot")}</option>
					{bots.map((bot) => (
						<option key={bot.id} value={bot.id}>
							{bot.displayName}
						</option>
					))}
				</select>
			</label>
			{botId ? <SocialPersona key={botId} botId={botId} /> : null}
		</section>
	);
}

function SocialPersona({ botId }: { botId: string }) {
	const { t } = useTranslation();
	const api = useApi();
	const client = useQueryClient();
	const [edit, setEdit] = useState<string | null>(null);
	const data = useQuery({ queryKey: ["social-persona", botId], queryFn: () => api.botSocial(botId) });
	const save = useMutation({
		mutationFn: (value: string) => api.saveBotSocial(botId, value),
		onSuccess: (value) => {
			client.setQueryData(["social-persona", botId], value);
			setEdit(null);
		},
	});
	if (data.isLoading) return <p role="status">{t("app.loading")}</p>;
	if (!data.data) return <p role="alert">{t("members.errors.unknown")}</p>;
	return (
		<>
			<label className="flex flex-col gap-[var(--spacing-2)]">
				{t("members.social.persona")}
				<textarea
					rows={6}
					className="rounded-[var(--radius-control-sm)] bg-[var(--color-bg-subtle)] p-[var(--spacing-2)]"
					value={edit ?? data.data.content}
					maxLength={20000}
					onChange={(event) => setEdit(event.target.value)}
				/>
			</label>
			<Button disabled={edit === null} loading={save.isPending} onClick={() => save.mutate(edit ?? "")}>
				{t("members.social.save")}
			</Button>
			{save.isError ? <p role="alert">{t("members.errors.unknown")}</p> : null}
		</>
	);
}
