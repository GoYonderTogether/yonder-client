import type { SocialLibrary, SocialLibraryChange, SocialLibraryFolder } from "@yonder/protocol";
import { useEditSocialLibrary } from "@yonder/ui-data";
import { createContext, type DragEvent, type ReactNode, useContext, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ReceptionMutationError } from "./reception-library-editor.tsx";
import { receptionFolderTrail, receptionWritablePath } from "./reception-library-paths.ts";

const RECEPTION_DRAG = "application/x-yonder-reception-item";

type DragItem = { kind: "document" | "folder"; id: string; parentId: string | null; path?: string | undefined };
type SourceProps = {
	draggable: boolean;
	onDragStart: (event: DragEvent<HTMLElement>) => void;
	onDragEnd: () => void;
};
type TargetProps = {
	onDragOver: (event: DragEvent<HTMLElement>) => void;
	onDragLeave: (event: DragEvent<HTMLElement>) => void;
	onDrop: (event: DragEvent<HTMLElement>) => void;
};
const ReceptionDrag = createContext<{
	source(item: DragItem): SourceProps | undefined;
	target(folder: SocialLibraryFolder | null): TargetProps | undefined;
} | null>(null);

export const useReceptionDrag = () => useContext(ReceptionDrag);
export const receptionDropHighlight =
	"data-[reception-drop-active]:outline-2 data-[reception-drop-active]:outline-offset-[-2px] data-[reception-drop-active]:outline-[var(--color-accent)]";

export function ReceptionDragProvider({ library, children }: { library: SocialLibrary; children: ReactNode }) {
	const { t } = useTranslation();
	const { edit, busy } = useEditSocialLibrary();
	const dragged = useRef<DragItem | null>(null);
	const highlighted = useRef<HTMLElement | null>(null);

	function highlight(element: HTMLElement | null) {
		if (highlighted.current === element) return;
		highlighted.current?.removeAttribute("data-reception-drop-active");
		highlighted.current = element;
		element?.setAttribute("data-reception-drop-active", "");
	}

	function finish() {
		dragged.current = null;
		highlight(null);
	}

	function source(item: DragItem): SourceProps | undefined {
		if (busy || item.path === "/notes" || !receptionWritablePath(item.path)) return;
		return {
			draggable: true,
			onDragStart: (event) => {
				event.dataTransfer.setData(RECEPTION_DRAG, item.id);
				event.dataTransfer.effectAllowed = "move";
				dragged.current = item;
			},
			onDragEnd: finish,
		};
	}

	function target(folder: SocialLibraryFolder | null): TargetProps | undefined {
		if (!receptionWritablePath(folder?.path)) return;
		const folderId = folder?.id ?? null;
		const trail = receptionFolderTrail(library.folders, folderId);

		function candidate(event: DragEvent<HTMLElement>) {
			const item = dragged.current;
			if (
				busy ||
				!item ||
				!event.dataTransfer.types.includes(RECEPTION_DRAG) ||
				item.parentId === folderId ||
				(item.kind === "folder" && trail.some(({ id }) => id === item.id))
			)
				return null;
			return item;
		}

		return {
			onDragOver: (event) => {
				if (!candidate(event)) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				highlight(event.currentTarget);
			},
			onDragLeave: (event) => {
				if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
				if (highlighted.current === event.currentTarget) highlight(null);
			},
			onDrop: (event) => {
				const item = candidate(event);
				if (!item || event.dataTransfer.getData(RECEPTION_DRAG) !== item.id) return;
				event.preventDefault();
				finish();
				const change: SocialLibraryChange =
					item.kind === "folder"
						? { kind: "move_folder", id: item.id, parentFolderId: folderId }
						: { kind: "move_document", id: item.id, folderId };
				edit.mutate(change);
			},
		};
	}

	if (!window.matchMedia?.("(any-pointer: fine)").matches) return children;
	return (
		<ReceptionDrag.Provider value={{ source, target }}>
			<ReceptionMutationError error={edit.error} />
			{edit.isPending || edit.isSuccess ? (
				<p role="status" className="text-caption text-[var(--color-text-secondary)]">
					{t(edit.isPending ? "members.social.library.moving" : "members.social.library.moved")}
				</p>
			) : null}
			{children}
		</ReceptionDrag.Provider>
	);
}
