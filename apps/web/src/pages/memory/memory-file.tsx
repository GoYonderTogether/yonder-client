import type { MemoryFileContent, MemoryVisibility as Visibility } from "@yonder/protocol";
import { Button, SelectField, TextArea } from "@yonder/ui-components";
import { useMemoryFile, useMemoryFileActions } from "@yonder/ui-data";
import { History, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MemoryHistory } from "./memory-history.tsx";
import { MemoryMarkdown } from "./memory-markdown.tsx";
import { MemoryError } from "./memory-status.tsx";
import { MemoryVisibility, VISIBILITY } from "./memory-visibility.tsx";

export const ABOUT_MEMORY = [
	{ path: "/me/印象.md", label: "memory.impression" },
	{ path: "/me/近期.md", label: "memory.recent" },
] as const;

interface MemoryFileProps {
	path: string;
	title: string;
	owner: boolean;
	onOpen: (path: string) => void;
	onDeleted?: () => void;
}

export function MemoryFile(props: MemoryFileProps) {
	const { t } = useTranslation();
	const file = useMemoryFile(props.path);
	return (
		<article className="memory-file" aria-busy={file.isPending}>
			<h3 className="wrap-anywhere text-h3">{props.title || file.data?.title || props.path}</h3>
			{!props.title && file.data?.title ? <code className="text-caption wrap-anywhere">{props.path}</code> : null}
			{file.isPending ? <p className="text-caption">{t("app.loading")}</p> : null}
			{file.error ? <MemoryError error={file.error} retry={() => void file.refetch()} /> : null}
			{file.data ? <FileBody {...props} key={props.path} file={file.data} /> : null}
		</article>
	);
}

function FileBody({ file, owner, onOpen, onDeleted }: MemoryFileProps & { file: MemoryFileContent }) {
	const { t } = useTranslation();
	const actions = useMemoryFileActions();
	const [draft, setDraft] = useState<{ content: string; expectedVersion: number }>();
	const [history, setHistory] = useState(false);
	const [confirmation, setConfirmation] = useState<"public" | "delete">();
	const busy = actions.update.isPending || actions.setVisibility.isPending || actions.remove.isPending;
	const changeError = actions.update.error ?? actions.setVisibility.error ?? actions.remove.error;
	const canDelete = !ABOUT_MEMORY.some(({ path }) => path === file.path);
	const visibilityOptions = Object.entries(VISIBILITY).map(([value, { label }]) => ({ value, label: t(label) }));

	function changeVisibility(value: Visibility) {
		actions.setVisibility.reset();
		if (value === "public") setConfirmation("public");
		else actions.setVisibility.mutate({ path: file.path, visibility: value });
	}

	return (
		<>
			<div className="memory-file-actions">
				<MemoryVisibility visibility={file.visibility} />
				{file.userEdited ? <span className="text-caption">{t("memory.userEdited")}</span> : null}
			</div>
			{draft ? (
				<form
					className="memory-file-body"
					onSubmit={(event) => {
						event.preventDefault();
						actions.update.mutate({ path: file.path, ...draft }, { onSuccess: () => setDraft(undefined) });
					}}
				>
					<TextArea
						aria-label={t("memory.content")}
						value={draft.content}
						rows={6}
						disabled={busy}
						onChange={(event) => setDraft({ ...draft, content: event.target.value })}
					/>
					<div className="memory-file-actions">
						<Button size="sm" type="submit" variant="primary" loading={actions.update.isPending}>
							{t("app.save")}
						</Button>
						<Button
							size="sm"
							disabled={busy}
							onClick={() => {
								actions.update.reset();
								setDraft(undefined);
							}}
						>
							{t("app.cancel")}
						</Button>
					</div>
				</form>
			) : (
				<>
					<MemoryMarkdown file={file} onOpen={onOpen} />
					<div className="memory-file-actions">
						{owner ? (
							<Button
								size="sm"
								disabled={busy || Boolean(confirmation)}
								onClick={() => {
									setHistory(false);
									setDraft({ content: file.content, expectedVersion: file.version });
								}}
							>
								<Pencil className="size-[var(--spacing-4)]" aria-hidden />
								{t("memory.edit")}
							</Button>
						) : null}
						<Button
							size="sm"
							aria-expanded={history}
							disabled={Boolean(confirmation) || busy}
							onClick={() => setHistory(!history)}
						>
							<History className="size-[var(--spacing-4)]" aria-hidden />
							{t("memory.history")}
						</Button>
					</div>
					{history ? <MemoryHistory file={file} owner={owner} /> : null}
					{owner && !history ? (
						<div className="memory-file-actions">
							<SelectField
								label={t("memory.visibility")}
								value={file.visibility}
								options={visibilityOptions}
								fieldSize="sm"
								disabled={busy || Boolean(confirmation)}
								onChange={(value) => changeVisibility(value as Visibility)}
							/>
							{canDelete ? (
								<Button
									size="sm"
									variant="danger"
									disabled={busy || Boolean(confirmation)}
									onClick={() => setConfirmation("delete")}
								>
									{t("memory.deleteFile")}
								</Button>
							) : null}
						</div>
					) : null}
					{confirmation ? (
						<div className="memory-file-body">
							<p>{t(confirmation === "public" ? "memory.publicQuestion" : "memory.deleteFileQuestion")}</p>
							<div className="memory-file-actions">
								<Button
									size="sm"
									variant={confirmation === "public" ? "primary" : "danger"}
									loading={actions.setVisibility.isPending || actions.remove.isPending}
									onClick={() => {
										if (confirmation === "public") {
											actions.setVisibility.mutate(
												{ path: file.path, visibility: "public" },
												{ onSuccess: () => setConfirmation(undefined) },
											);
										} else {
											actions.remove.mutate(file.path, { onSuccess: () => onDeleted?.() });
										}
									}}
								>
									{t(confirmation === "public" ? "memory.publicConfirm" : "memory.deleteConfirm")}
								</Button>
								<Button size="sm" disabled={busy} onClick={() => setConfirmation(undefined)}>
									{t("app.cancel")}
								</Button>
							</div>
						</div>
					) : null}
				</>
			)}
			{changeError ? <MemoryError error={changeError} /> : null}
		</>
	);
}
