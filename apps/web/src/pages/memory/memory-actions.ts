import type { MemoryLink, MemoryTarget } from "@yonder/protocol";
import type { PreviewFile } from "../../preview/file-kind.ts";

/** What an open memory entry and its drawer can do; the day list owns the state behind it. */
export interface EntryActions {
	open: string | null;
	/** The entry a link just landed on, highlighted briefly. */
	flash: string | null;
	onToggle: (id: string) => void;
	onLink: (link: MemoryLink) => void;
	onPreview: (file: PreviewFile) => void;
	/** A source row opens its referenced meeting, conversation or scheduled-task list. */
	onSource: (target: MemoryTarget | null, meetingId?: string, title?: string) => void;
	onDelete: (id: string) => void;
	/** The entry being deleted, while its request is in flight. */
	deleting: string | null;
	/** The real reason a delete failed, shown under that entry's button. */
	deleteError: { id: string; error: Error } | null;
}
