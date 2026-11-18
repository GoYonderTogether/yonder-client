import type { ConversationMember } from "@yonder/protocol";
import { Button, ListGroup, ListRow } from "@yonder/ui-components";
import { Pencil } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { memberFailureText } from "../profile/failure.ts";
import { GroupAvatar } from "./group-avatar.tsx";

const NAME_LIMIT = 80;

export interface GroupTitleProps {
	title: string;
	members: readonly ConversationMember[];
	/** The owner may rename; for everyone else the name is text (19 第三节). */
	editable: boolean;
	saving: boolean;
	onRename: (title: string) => Promise<unknown>;
}

/**
 * The group's name, renamed in place: the same row turns into an input with save and cancel, so a
 * rename costs one interaction and no page. Enter saves, Escape cancels — the two things a keyboard
 * user expects from an inline field.
 */
export function GroupTitle({ title, members, editable, saving, onRename }: GroupTitleProps) {
	const { t } = useTranslation();
	const [draft, setDraft] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const submitting = useRef(false);
	const field = useRef<HTMLInputElement>(null);
	const errorId = useId();
	const editing = editable && draft !== null;
	const value = draft?.trim() ?? "";
	const canSave = editing && !saving && Boolean(value) && value !== title;
	const avatar = <GroupAvatar members={members} />;

	// Renaming is a deliberate click on this row, so the field takes focus; a scrolled page is not moved.
	useEffect(() => {
		if (editing) field.current?.focus({ preventScroll: true });
		if (!editable) {
			setDraft(null);
			setError(null);
		}
	}, [editing, editable]);

	const cancel = () => {
		if (saving || submitting.current) return;
		setDraft(null);
		setError(null);
	};
	const commit = async () => {
		if (!canSave || submitting.current) return;
		submitting.current = true;
		setError(null);
		try {
			await onRename(value);
			setDraft(null);
		} catch (failure) {
			setError(memberFailureText(failure, t));
		} finally {
			submitting.current = false;
		}
	};

	if (!editing) {
		return (
			<ListGroup>
				<ListRow
					leading={avatar}
					title={title}
					trailing={editable ? <Pencil size={14} aria-hidden /> : undefined}
					onClick={editable ? () => setDraft(title) : undefined}
					disabled={!editable || saving}
					className={!editable ? "cursor-default hover:bg-transparent" : undefined}
					aria-label={editable ? t("members.group.renameTitle", { name: title }) : undefined}
				/>
			</ListGroup>
		);
	}

	return (
		<ListGroup>
			<li>
				<div className="flex min-h-[var(--row-height)] items-center gap-[var(--spacing-2)] px-[var(--spacing-4)]">
					{avatar}
					<input
						ref={field}
						aria-label={t("members.group.nameLabel")}
						aria-invalid={error ? true : undefined}
						aria-describedby={error ? errorId : undefined}
						value={draft ?? ""}
						maxLength={NAME_LIMIT}
						readOnly={saving}
						onChange={(event) => {
							setDraft(event.target.value);
							setError(null);
						}}
						onKeyDown={(event) => {
							if (event.nativeEvent.isComposing) return;
							if (event.key === "Enter") {
								event.preventDefault();
								void commit();
							} else if (event.key === "Escape") {
								event.preventDefault();
								cancel();
							}
						}}
						className="min-w-0 flex-1 bg-transparent text-body text-[var(--color-text-primary)] outline-none"
					/>
					<Button size="sm" onClick={cancel} disabled={saving}>
						{t("members.group.cancel")}
					</Button>
					<Button size="sm" variant="primary" loading={saving} disabled={!canSave} onClick={() => void commit()}>
						{t("members.group.save")}
					</Button>
				</div>
				{error ? (
					<p
						id={errorId}
						role="alert"
						className="px-[var(--spacing-4)] pb-[var(--spacing-2)] text-caption text-[var(--color-danger)]"
					>
						{error}
					</p>
				) : null}
			</li>
		</ListGroup>
	);
}
