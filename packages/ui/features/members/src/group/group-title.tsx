import { Button, ListGroup, ListRow } from "@yonder/ui-components";
import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const NAME_LIMIT = 80;

export interface GroupTitleProps {
	title: string;
	/** The owner may rename; for everyone else the name is text (19 第三节). */
	editable: boolean;
	saving: boolean;
	onRename: (title: string) => void;
}

/**
 * The group's name, renamed in place: the same row turns into an input with save and cancel, so a
 * rename costs one interaction and no page. Enter saves, Escape cancels — the two things a keyboard
 * user expects from an inline field.
 */
export function GroupTitle({ title, editable, saving, onRename }: GroupTitleProps) {
	const { t } = useTranslation();
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState(title);
	const field = useRef<HTMLInputElement>(null);

	// A rename from another device replaces the row; the field must not keep a stale draft on screen.
	useEffect(() => {
		if (!editing) setValue(title);
	}, [title, editing]);

	// Renaming is a deliberate click on this row, so the field takes focus; a scrolled page is not moved.
	useEffect(() => {
		if (editing) field.current?.focus({ preventScroll: true });
	}, [editing]);

	const commit = () => {
		const trimmed = value.trim();
		if (!trimmed || trimmed === title) {
			setEditing(false);
			setValue(title);
			return;
		}
		onRename(trimmed);
		setEditing(false);
	};

	if (!editing) {
		return (
			<ListGroup>
				<ListRow
					title={title}
					trailing={editable ? <Pencil size={14} aria-hidden /> : undefined}
					onClick={editable ? () => setEditing(true) : undefined}
					disabled={!editable}
					className={!editable ? "cursor-default hover:bg-transparent" : undefined}
					aria-label={editable ? t("members.group.rename") : undefined}
				/>
			</ListGroup>
		);
	}

	return (
		<ListGroup>
			<li className="flex min-h-[var(--row-height)] items-center gap-[var(--spacing-2)] px-[var(--spacing-4)]">
				<input
					ref={field}
					aria-label={t("members.group.nameLabel")}
					value={value}
					maxLength={NAME_LIMIT}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							commit();
						} else if (event.key === "Escape") {
							event.preventDefault();
							setValue(title);
							setEditing(false);
						}
					}}
					className="min-w-0 flex-1 bg-transparent text-body text-[var(--color-text-primary)] outline-none"
				/>
				<Button
					size="sm"
					onClick={() => {
						setValue(title);
						setEditing(false);
					}}
					disabled={saving}
				>
					{t("members.group.cancel")}
				</Button>
				<Button
					size="sm"
					variant="primary"
					loading={saving}
					disabled={!value.trim() || value.trim() === title}
					onClick={commit}
				>
					{t("members.group.save")}
				</Button>
			</li>
		</ListGroup>
	);
}
