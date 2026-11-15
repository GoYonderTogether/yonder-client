import { Button } from "@yonder/ui-components";
import { useSkill, useSkillActions } from "@yonder/ui-data";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { readSkillFiles } from "./read-skill-files.ts";

export function SkillImport({ id, onDone }: { id?: string; onDone: (id: string) => void }) {
	const { t } = useTranslation();
	const skill = useSkill(id ?? "");
	const actions = useSkillActions();
	const [files, setFiles] = useState<Record<string, string> | null>(null);
	const [error, setError] = useState(false);
	const [reading, setReading] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const folderInput = useRef<HTMLInputElement>(null);
	const pending = reading || actions.create.isPending || actions.update.isPending;
	async function choose(selected: FileList | null) {
		if (!selected?.length) return;
		setError(false);
		actions.create.reset();
		actions.update.reset();
		setFiles(null);
		setReading(true);
		try {
			setFiles(await readSkillFiles(Array.from(selected)));
		} catch {
			setError(true);
		} finally {
			setReading(false);
		}
	}
	if (id && skill.isLoading) return <p role="status">{t("app.loading")}</p>;
	if (id && (skill.isError || !skill.data?.canEdit))
		return (
			<div role="alert">
				<p>{t(skill.isError ? "skills.loadFailed" : "errors.forbidden")}</p>
				{skill.isError ? <Button onClick={() => void skill.refetch()}>{t("app.retry")}</Button> : null}
			</div>
		);
	return (
		<div className="flex flex-col gap-[var(--spacing-4)]">
			<p className="text-caption text-[var(--color-text-secondary)]">
				{t(id ? "skills.replaceHint" : "skills.importHint")}
			</p>
			<div className="flex flex-wrap gap-[var(--spacing-2)]">
				<Button onClick={() => folderInput.current?.click()} disabled={pending}>
					{t("skills.chooseFolder")}
				</Button>
				<Button onClick={() => fileInput.current?.click()} disabled={pending}>
					{t("skills.chooseFiles")}
				</Button>
				<input
					ref={fileInput}
					type="file"
					multiple
					hidden
					aria-label={t("skills.chooseFiles")}
					onChange={(event) => {
						void choose(event.target.files);
						event.target.value = "";
					}}
				/>
				<input
					ref={(node) => {
						folderInput.current = node;
						node?.setAttribute("webkitdirectory", "");
					}}
					type="file"
					multiple
					hidden
					aria-label={t("skills.chooseFolder")}
					onChange={(event) => {
						void choose(event.target.files);
						event.target.value = "";
					}}
				/>
			</div>
			<p className="text-caption text-[var(--color-text-tertiary)]">{t("skills.fileLimit")}</p>
			{reading ? <p role="status">{t("app.loading")}</p> : null}
			{files ? (
				<div>
					<p role="status">{t("skills.selectedFiles", { count: Object.keys(files).length })}</p>
					<ul className="mt-[var(--spacing-2)] break-words text-caption text-[var(--color-text-secondary)]">
						{Object.keys(files).map((path) => (
							<li key={path}>{path}</li>
						))}
					</ul>
				</div>
			) : null}
			{error || actions.create.isError || actions.update.isError ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{t(error ? "skills.invalidFiles" : "skills.saveFailed")}
				</p>
			) : null}
			<Button
				variant="primary"
				className="self-start"
				disabled={!files || pending}
				loading={actions.create.isPending || actions.update.isPending}
				onClick={() => {
					if (!files) return;
					const callbacks = { onSuccess: (saved: { id: string }) => onDone(saved.id) };
					if (id) actions.update.mutate({ id, files }, callbacks);
					else actions.create.mutate({ files }, callbacks);
				}}
			>
				{t(id ? "app.save" : "skills.import")}
			</Button>
		</div>
	);
}
