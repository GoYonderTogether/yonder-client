import { Button, Checkbox, SelectField } from "@yonder/ui-components";
import { useSkill, useSkillActions, useSkillFile } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function SkillDetailView({ id, onOpenPage }: { id: string; onOpenPage: (page: string | null) => void }) {
	const { t } = useTranslation();
	const skill = useSkill(id);
	const actions = useSkillActions();
	const [file, setFile] = useState("SKILL.md");
	const path = skill.data?.files.includes(file) ? file : "SKILL.md";
	const content = useSkillFile(id, skill.data?.revision ?? "", path);
	if (skill.isLoading) return <p role="status">{t("app.loading")}</p>;
	if (skill.isError || !skill.data)
		return (
			<div role="alert">
				<p>{t("skills.loadFailed")}</p>
				<Button onClick={() => void skill.refetch()}>{t("app.retry")}</Button>
			</div>
		);
	const entry = skill.data;
	return (
		<div className="flex min-w-0 flex-col gap-[var(--spacing-4)]">
			<div>
				<h2 className="break-words text-h3 font-semibold">
					{entry.name}{" "}
					{entry.displayNameZh ? (
						<span className="text-body font-normal text-[var(--color-text-tertiary)]">{entry.displayNameZh}</span>
					) : null}
				</h2>
				{!entry.displayNameZh && entry.canEdit ? (
					<p className="text-caption text-[var(--color-text-tertiary)]">{t("skills.missingChineseName")}</p>
				) : null}
				<p className="mt-[var(--spacing-2)] break-words text-body text-[var(--color-text-secondary)]">
					{entry.description}
				</p>
				<p className="mt-[var(--spacing-2)] text-caption text-[var(--color-text-tertiary)]">
					{t(`skills.source.${entry.source}`)}
				</p>
			</div>
			<Checkbox
				checked={entry.enabled}
				aria-label={t("skills.enable", { name: entry.name })}
				disabled={actions.update.isPending}
				onChange={(event) => actions.update.mutate({ id, enabled: event.target.checked })}
			>
				{t(entry.enabled ? "skills.enabled" : "skills.disabled")}
			</Checkbox>
			<SelectField
				label={t("skills.file")}
				value={path}
				options={entry.files.map((name) => ({ value: name, label: name }))}
				onChange={setFile}
			/>
			{content.isLoading ? <p role="status">{t("app.loading")}</p> : null}
			{content.isError ? <Button onClick={() => void content.refetch()}>{t("app.retry")}</Button> : null}
			{content.data ? (
				<pre className="max-h-[calc(var(--control-md)*10)] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--color-bg-subtle)] p-[var(--spacing-4)] text-caption text-[var(--color-text-primary)]">
					{content.data.content}
				</pre>
			) : null}
			{entry.canEdit ? (
				<div className="flex flex-wrap gap-[var(--spacing-2)]">
					<Button onClick={() => onOpenPage(`replace-${id}`)}>{t("skills.replace")}</Button>
					<Button
						variant="danger"
						loading={actions.remove.isPending}
						onClick={() => {
							if (window.confirm(t("skills.deleteConfirm", { name: entry.name })))
								actions.remove.mutate(id, { onSuccess: () => onOpenPage(null) });
						}}
					>
						{t("skills.delete")}
					</Button>
				</div>
			) : null}
			{actions.update.isError || actions.remove.isError ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{t("skills.actionFailed")}
				</p>
			) : null}
		</div>
	);
}
