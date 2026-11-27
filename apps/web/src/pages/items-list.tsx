import type { Member } from "@yonder/protocol";
import { Button, EmptyState, ListGroup, ListRow, type RowAction, TaskGlyph } from "@yonder/ui-components";
import { ApiError, useArchivedItems, useContacts, useItemListAction, useItems, useSchedules } from "@yonder/ui-data";
import { Archive, ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ItemActionDialog } from "./item-action-dialog.tsx";
import { groupItems, itemGroupKey, upcomingOneOffs } from "./items-format.ts";
import { ItemRow } from "./items-row.tsx";
import { formatInstant } from "./schedule-format.ts";

type ItemTarget = { id: string; title: string; upcoming: boolean };

/**
 * The 事项 tab (16-3 第八节): every item the Bot has worked on, newest first, grouped by day. 更早
 * starts collapsed, because the last few days are what a person checks; the rest is one tap away.
 *
 * Meta Muse is the reference (2026-11-24): a row offers 改名 and 删除 only. Archiving is the nightly
 * tidy's job, and an upcoming plan is a scheduled task, which the app can only delete. The folded
 * 已归档 section stays, so past work is one tap below the live list.
 */
export function ItemsList({ onOpen }: { onOpen: (id: string) => void }) {
	const { t, i18n } = useTranslation();
	const [dialog, setDialog] = useState<(ItemTarget & { action: "rename" | "delete" }) | null>(null);
	const edit = useItemListAction();
	const query = useItems();
	const schedules = useSchedules();
	const contacts = useContacts();
	const [showEarlier, setShowEarlier] = useState(false);
	const [showArchived, setShowArchived] = useState(false);
	const archivedQuery = useArchivedItems(showArchived);
	const archivedItems = useMemo(
		() => archivedQuery.data?.pages.flatMap((page) => page.items) ?? [],
		[archivedQuery.data],
	);
	const [now] = useState(() => new Date());
	const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
	const groups = useMemo(() => groupItems(items, now, deviceZone()), [items, now]);
	const names = useMemo(() => botNames(contacts.data?.items), [contacts.data]);
	const upcoming = upcomingOneOffs(schedules.data?.items ?? []);
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const more = useRef<HTMLDivElement>(null);
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
	const error =
		edit.error instanceof ApiError ? t(edit.error.messageKey) : edit.isError ? t("tasks.actionFailed") : null;

	function start(target: ItemTarget, action: "rename" | "delete") {
		edit.reset();
		setDialog({ ...target, action });
	}

	function rowActions(target: ItemTarget): RowAction[] {
		return [
			{
				label: t("tasks.itemRename"),
				icon: <Pencil size={18} />,
				onSelect: () => start(target, "rename"),
				disabled: edit.isPending,
			},
			{
				label: t("tasks.delete"),
				icon: <Trash2 size={18} />,
				tone: "danger",
				onSelect: () => start(target, "delete"),
				disabled: edit.isPending,
			},
		];
	}

	/** An upcoming one-off is a scheduled task: the app deletes it, and the Bot is told to change it. */
	function planActions(plan: { id: string; title: string }): RowAction[] {
		return [
			{
				label: t("tasks.delete"),
				icon: <Trash2 size={18} />,
				tone: "danger",
				onSelect: () => start({ ...plan, upcoming: true }, "delete"),
				disabled: edit.isPending,
			},
		];
	}

	// Older items load as the end of the list comes near; a day boundary is not a page boundary.
	useEffect(() => {
		const element = more.current;
		if (!element || !hasNextPage || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
			},
			{ rootMargin: "400px" },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	return (
		<div className="flex flex-col gap-[var(--spacing-4)] py-[var(--spacing-3)]">
			{error && !dialog ? (
				<p role="alert" className="px-[var(--spacing-4)] text-caption text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
			{upcoming.length > 0 ? (
				<ListGroup title={t("tasks.itemUpcoming")}>
					{upcoming.map((plan) => (
						<ListRow
							key={plan.id}
							title={plan.title}
							subtitle={formatInstant(plan.timezone, plan.nextRunAt ?? plan.at, locale)}
							actions={planActions(plan)}
						/>
					))}
				</ListGroup>
			) : null}
			{query.isLoading ? (
				<ListGroup>
					<li className="p-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">
						{t("tasks.itemsLoading")}
					</li>
				</ListGroup>
			) : null}
			{query.isError && !query.data ? (
				<ListGroup>
					<li className="flex items-center gap-[var(--spacing-3)] p-[var(--spacing-4)] text-caption text-[var(--color-danger)]">
						<span role="alert">
							{query.error instanceof ApiError ? t(query.error.messageKey) : t("app.loadFailed")}
						</span>
						<Button variant="link" size="sm" onClick={() => void query.refetch()}>
							{t("app.retry")}
						</Button>
					</li>
				</ListGroup>
			) : null}
			{!query.isLoading && !query.isError && items.length === 0 && upcoming.length === 0 ? (
				<EmptyState icon={<TaskGlyph size={24} />} title={t("tasks.emptyTitle")} />
			) : null}
			{groups.map((section) => {
				const earlier = section.group === "earlier";
				const shown = earlier && !showEarlier ? section.items.slice(0, EARLIER_PREVIEW) : section.items;
				return (
					<ListGroup key={section.group} title={t(itemGroupKey(section.group))}>
						{shown.map((item) => (
							<ItemRow
								key={item.id}
								item={item}
								botName={names.get(item.botMemberId) ?? null}
								actions={rowActions({ id: item.id, title: item.title, upcoming: false })}
								onOpen={() => onOpen(item.id)}
							/>
						))}
						{earlier && !showEarlier && section.items.length > EARLIER_PREVIEW ? (
							<li>
								<button
									type="button"
									className="flex min-h-[var(--row-height)] w-full items-center justify-center gap-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
									onClick={() => setShowEarlier(true)}
								>
									<ChevronDown size={16} strokeWidth={1.8} />
									{t("tasks.itemsLoadMore")}
								</button>
							</li>
						) : null}
					</ListGroup>
				);
			})}
			<div ref={more} aria-hidden className="h-[1px]" />
			<ListGroup>
				<li>
					<button
						type="button"
						aria-expanded={showArchived}
						className="flex min-h-[var(--row-height)] w-full items-center gap-[var(--spacing-2)] px-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
						onClick={() => setShowArchived(!showArchived)}
					>
						{showArchived ? <ChevronDown size={16} strokeWidth={1.8} /> : <ChevronRight size={16} strokeWidth={1.8} />}
						<Archive size={16} strokeWidth={1.8} aria-hidden />
						{t("tasks.itemsArchived")}
					</button>
				</li>
				{showArchived && archivedQuery.isLoading ? (
					<li className="p-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">
						{t("tasks.itemsLoading")}
					</li>
				) : null}
				{showArchived && archivedQuery.isError && !archivedQuery.data ? (
					<li className="flex items-center gap-[var(--spacing-3)] p-[var(--spacing-4)] text-caption text-[var(--color-danger)]">
						<span role="alert">
							{archivedQuery.error instanceof ApiError ? t(archivedQuery.error.messageKey) : t("app.loadFailed")}
						</span>
						<Button variant="link" size="sm" onClick={() => void archivedQuery.refetch()}>
							{t("app.retry")}
						</Button>
					</li>
				) : null}
				{showArchived && archivedQuery.isSuccess && archivedItems.length === 0 ? (
					<li className="p-[var(--spacing-4)] text-caption text-[var(--color-text-secondary)]">
						{t("tasks.itemsArchivedEmpty")}
					</li>
				) : null}
				{showArchived
					? archivedItems.map((item) => (
							<ItemRow
								key={item.id}
								item={item}
								botName={names.get(item.botMemberId) ?? null}
								actions={rowActions({ id: item.id, title: item.title, upcoming: false })}
								onOpen={() => onOpen(item.id)}
							/>
						))
					: null}
				{showArchived && archivedQuery.hasNextPage ? (
					<li>
						<button
							type="button"
							disabled={archivedQuery.isFetchingNextPage}
							className="flex min-h-[var(--row-height)] w-full items-center justify-center gap-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
							onClick={() => void archivedQuery.fetchNextPage()}
						>
							<ChevronDown size={16} strokeWidth={1.8} />
							{t("tasks.itemsLoadMore")}
						</button>
					</li>
				) : null}
			</ListGroup>
			{dialog ? (
				<ItemActionDialog
					key={`${dialog.id}:${dialog.action}`}
					initialTitle={dialog.title}
					action={dialog.action}
					upcoming={dialog.upcoming}
					busy={edit.isPending}
					error={error}
					onClose={() => {
						if (edit.isPending) return;
						edit.reset();
						setDialog(null);
					}}
					onConfirm={async (title) => {
						try {
							await edit.mutateAsync(
								title === undefined ? { ...dialog, remove: true } : { ...dialog, patch: { title } },
							);
							setDialog(null);
						} catch {
							// The dialog shows the mutation error and keeps the input available.
						}
					}}
				/>
			) : null}
		</div>
	);
}

/** The Bot of each item, by id: a row names who did the work, so an account's Bots are read once. */
function botNames(members: readonly Member[] | undefined) {
	return new Map(
		(members ?? []).filter((member) => member.kind === "bot").map((member) => [member.id, member.displayName]),
	);
}

/** How many 更早 items are visible before the group is expanded. */
const EARLIER_PREVIEW = 5;

/** The device's zone, so "today" is the reader's today rather than the server's. */
function deviceZone(): string | undefined {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
	} catch {
		return undefined;
	}
}
