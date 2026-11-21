import { Button, TextInput } from "@yonder/ui-components";
import { usePerson, useRenameItemSession } from "@yonder/ui-data";
import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function ItemSessionTitle({ id, title, canRename }: { id: string; title: string; canRename: boolean }) {
	const { t } = useTranslation();
	const person = usePerson();
	const rename = useRenameItemSession(person?.id);
	const [draft, setDraft] = useState<string>();
	const form = useRef<HTMLFormElement>(null);
	const editing = draft !== undefined;
	useEffect(() => {
		if (editing) form.current?.querySelector("input")?.focus();
	}, [editing]);
	const next = draft?.trim().replace(/\s+/g, " ");
	const canSave = canRename && next && next !== title && Array.from(next).length <= 100;
	return (
		<div className="flex min-w-0 flex-col">
			<div className="flex min-w-0 items-center gap-[var(--spacing-1)]">
				<h1 className="truncate text-h3 font-semibold" title={title}>
					{title}
				</h1>
				{canRename && draft === undefined ? (
					<Button
						variant="link"
						size="sm"
						aria-label={t("meetingRecorder.archiveRename")}
						onClick={() => {
							rename.reset();
							setDraft(title);
						}}
					>
						<Pencil size={14} aria-hidden="true" />
					</Button>
				) : null}
			</div>
			{draft !== undefined ? (
				<form
					ref={form}
					className="flex min-w-0 flex-wrap items-center gap-[var(--spacing-1)]"
					onSubmit={(event) => {
						event.preventDefault();
						if (canSave) rename.mutate({ id, title: next }, { onSuccess: () => setDraft(undefined) });
					}}
				>
					<TextInput
						fieldSize="sm"
						className="flex-1"
						value={draft}
						aria-label={t("meetingRecorder.archiveRename")}
						disabled={rename.isPending}
						onChange={(event) => setDraft(event.currentTarget.value)}
					/>
					<Button size="sm" type="submit" loading={rename.isPending} disabled={!canSave}>
						{t("app.save")}
					</Button>
					<Button size="sm" variant="link" disabled={rename.isPending} onClick={() => setDraft(undefined)}>
						{t("app.cancel")}
					</Button>
					{rename.isError ? (
						<p role="alert" className="w-full text-caption text-[var(--color-danger)]">
							{t("meetingRecorder.archiveRenameFailed")}
						</p>
					) : null}
				</form>
			) : null}
		</div>
	);
}
