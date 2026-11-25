import type { MemoryOrganizationPlan } from "@yonder/protocol";
import { Button, Checkbox, TextField } from "@yonder/ui-components";
import { useMemoryFolders } from "@yonder/ui-data";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { Folder, Pencil } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { receptionFolderNames } from "./reception-library-paths.ts";

type Move = MemoryOrganizationPlan["moves"][number];

export type OrganizationSelection = { excluded: ReadonlySet<string>; destinations: ReadonlyMap<string, string> };

interface Node {
	folders: Map<string, Node>;
	files: Move[];
	ids: string[];
}

function treeFor(moves: readonly Move[], destinations: ReadonlyMap<string, string>): Node {
	const empty = (): Node => ({ folders: new Map(), files: [], ids: [] });
	const tree = empty();
	for (const move of moves) {
		const to = destinations.get(move.fileId) ?? move.to;
		let node = tree;
		for (const folder of to.split("/").slice(1, -1)) {
			const child = node.folders.get(folder) ?? empty();
			node.folders.set(folder, child);
			child.ids.push(move.fileId);
			node = child;
		}
		node.files.push({ ...move, to });
	}
	return tree;
}

export function ReceptionOrganizationTree({
	moves,
	selection,
	onChange,
	disabled,
}: {
	moves: readonly Move[];
	selection: OrganizationSelection;
	onChange: (selection: OrganizationSelection) => void;
	disabled: boolean;
}) {
	const { t } = useTranslation();
	const folderName = receptionFolderNames(useMemoryFolders().data?.items);
	const tree = useMemo(() => treeFor(moves, selection.destinations), [moves, selection.destinations]);
	const [editing, setEditing] = useState<Move | null>(null);
	function select(ids: string[], included: boolean) {
		const excluded = new Set(selection.excluded);
		for (const id of ids) {
			if (included) excluded.delete(id);
			else excluded.add(id);
		}
		onChange({ ...selection, excluded });
	}

	return (
		<>
			<Checkbox
				className="w-fit items-center"
				checked={selection.excluded.size === 0}
				ref={(input) => {
					if (input) input.indeterminate = selection.excluded.size > 0 && selection.excluded.size < moves.length;
				}}
				disabled={disabled}
				onChange={(event) =>
					select(
						moves.map((move) => move.fileId),
						event.target.checked,
					)
				}
			>
				{t("members.social.organization.selectAll")}
			</Checkbox>
			<OrganizationTreeNode
				node={tree}
				path=""
				folderName={folderName}
				excluded={selection.excluded}
				onSelect={select}
				onEdit={setEditing}
				disabled={disabled}
			/>
			{editing ? (
				<DestinationEditor
					move={editing}
					onClose={() => setEditing(null)}
					onChange={(to) => {
						onChange({ ...selection, destinations: new Map(selection.destinations).set(editing.fileId, to) });
						setEditing(null);
					}}
				/>
			) : null}
		</>
	);
}

function OrganizationTreeNode({
	node,
	path,
	folderName,
	excluded,
	onSelect,
	onEdit,
	disabled,
}: {
	node: Node;
	path: string;
	folderName: (path: string) => string;
	excluded: ReadonlySet<string>;
	onSelect: (ids: string[], included: boolean) => void;
	onEdit: (move: Move) => void;
	disabled: boolean;
}) {
	const { t } = useTranslation();
	return (
		<ul className="flex min-w-0 flex-col gap-[var(--spacing-2)]">
			{[...node.folders].map(([name, child]) => {
				const fullPath = `${path}/${name}`;
				const selected = child.ids.filter((id) => !excluded.has(id)).length;
				// The root's own folders read from the server's names; a folder the owner made keeps its
				// own name, which is the same thing the server returns for it.
				const folder = !path ? folderName(`/${name}`) : name;
				return (
					<li
						key={name}
						className="flex min-w-0 items-start gap-[var(--spacing-2)] rounded-[var(--radius-control-sm)] bg-[var(--color-bg-card)] p-[var(--spacing-2)]"
					>
						<Checkbox
							aria-label={t("members.social.organization.selectFolder", { path: fullPath })}
							checked={selected === child.ids.length}
							ref={(input) => {
								if (input) input.indeterminate = selected > 0 && selected < child.ids.length;
							}}
							disabled={disabled}
							onChange={(event) => onSelect(child.ids, event.target.checked)}
						/>
						<details className="min-w-0 flex-1" open={path === ""}>
							<summary className="cursor-pointer [overflow-wrap:anywhere] text-body font-medium">
								<Folder
									className="mx-[var(--spacing-1)] inline align-text-bottom text-[var(--color-accent-text)]"
									size={16}
									aria-hidden
								/>
								{folder}{" "}
								<span className="text-caption font-normal text-[var(--color-text-secondary)]">
									{selected}/{child.ids.length}
								</span>
							</summary>
							<div className="mt-[var(--spacing-2)] border-s border-[var(--color-border-subtle)] ps-[var(--spacing-2)]">
								<OrganizationTreeNode
									node={child}
									path={fullPath}
									folderName={folderName}
									excluded={excluded}
									onSelect={onSelect}
									onEdit={onEdit}
									disabled={disabled}
								/>
							</div>
						</details>
					</li>
				);
			})}
			{node.files.map((move) => (
				<li
					key={move.fileId}
					className="flex min-w-0 flex-col gap-[var(--spacing-2)] rounded-[var(--radius-control-sm)] bg-[var(--color-bg-base)] p-[var(--spacing-2)]"
				>
					<Checkbox
						disabled={disabled}
						checked={!excluded.has(move.fileId)}
						onChange={(event) => onSelect([move.fileId], event.target.checked)}
					>
						<span className="text-body font-medium text-[var(--color-text-primary)] [overflow-wrap:anywhere]">
							{move.title}
						</span>
						{move.draft ? (
							<span className="ms-[var(--spacing-2)] text-caption text-[var(--color-warning)]">
								{t("memory.pending")}
							</span>
						) : null}
					</Checkbox>
					<dl className="min-w-0 text-caption text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
						<dt>{t("members.social.organization.from")}</dt>
						<dd>{move.from}</dd>
						<dt className="mt-[var(--spacing-1)]">{t("members.social.organization.to")}</dt>
						<dd className="text-[var(--color-text-primary)]">{move.to}</dd>
					</dl>
					<Button
						className="self-start"
						size="sm"
						variant="ghost"
						disabled={disabled}
						aria-label={t("members.social.organization.adjustFile", { title: move.title })}
						onClick={() => onEdit(move)}
					>
						<Pencil size={14} aria-hidden />
						{t("members.social.organization.adjust")}
					</Button>
				</li>
			))}
		</ul>
	);
}

function DestinationEditor({
	move,
	onClose,
	onChange,
}: {
	move: Move;
	onClose: () => void;
	onChange: (path: string) => void;
}) {
	const { t } = useTranslation();
	const { mode } = useShellChrome();
	const form = useId();
	const [path, setPath] = useState(move.to);
	const value = path.trim();
	const permitted = value.startsWith("/public/") || (!move.draft && value.startsWith("/notes/"));
	const valid =
		permitted &&
		value.endsWith(".md") &&
		value !== move.from &&
		!/[\\\p{Cc}\p{Surrogate}]/u.test(value) &&
		value
			.slice(1)
			.split("/")
			.every((part) => part && part !== "." && part !== "..") &&
		new TextEncoder().encode(value).length <= 2048;
	return (
		<Overlay
			open
			mode={mode}
			size="small"
			title={t("members.social.organization.adjust")}
			closeLabel={t("app.close")}
			onClose={onClose}
			footer={
				<>
					<Button onClick={onClose}>{t("app.cancel")}</Button>
					<Button form={form} type="submit" variant="primary" disabled={!valid || value === move.to}>
						{t("app.save")}
					</Button>
				</>
			}
		>
			<form
				id={form}
				className="flex flex-col gap-[var(--spacing-3)] p-[var(--spacing-5)]"
				onSubmit={(event) => {
					event.preventDefault();
					if (valid && value !== move.to) onChange(value);
				}}
			>
				<TextField
					label={t("members.social.organization.to")}
					value={path}
					onChange={(event) => setPath(event.target.value)}
					autoComplete="off"
					spellCheck={false}
					maxLength={2048}
				/>
				{!valid ? (
					<p role="alert" className="text-caption text-[var(--color-danger)]">
						{t(move.draft ? "members.social.organization.draftPathInvalid" : "members.social.organization.pathInvalid")}
					</p>
				) : null}
			</form>
		</Overlay>
	);
}
