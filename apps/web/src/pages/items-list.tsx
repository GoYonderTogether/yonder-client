import type { Member } from "@yonder/protocol";
import { Button, EmptyState, IconButton, ListGroup } from "@yonder/ui-components";
import { ApiError, useContacts, useItems } from "@yonder/ui-data";
import { ChevronDown, ListChecks, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { groupItems, itemGroupKey } from "./items-format.ts";
import { ItemRow } from "./items-row.tsx";

/**
 * The 事项 tab (16-3 第八节): every item the Bot has worked on, newest first, grouped by day. 更早
 * starts collapsed, because the last few days are what a person checks; the rest is one tap away.
 */
export function ItemsList({ onOpen, onAdd }: { onOpen: (id: string) => void; onAdd: () => void }) {
	const { t, i18n } = useTranslation();
	const query = useItems();
	const contacts = useContacts();
	const [showEarlier, setShowEarlier] = useState(false);
	const [now] = useState(() => new Date());
	const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
	const groups = useMemo(() => groupItems(items, now, deviceZone()), [items, now]);
	const names = useMemo(() => botNames(contacts.data?.items), [contacts.data]);
	const more = useRef<HTMLDivElement>(null);
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

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
			<div className="flex justify-end px-[var(--spacing-2)]">
				<IconButton aria-label={t("tasks.addItem")} variant="secondary" onClick={onAdd}>
					<Plus size={18} strokeWidth={1.8} />
				</IconButton>
			</div>
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
			{!query.isLoading && !query.isError && items.length === 0 ? (
				<EmptyState icon={<ListChecks size={24} strokeWidth={1.6} />} title={t("tasks.emptyTitle")} />
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
								onOpen={() => onOpen(item.id)}
								locale={i18n.language}
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
