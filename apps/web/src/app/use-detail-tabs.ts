import type { SidePage, SidePanelControls } from "@yonder/ui-shell";
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import type { ChatBotPage } from "./chat-bot-settings.tsx";

export type SideEntry =
	| { kind: "bot"; id: string; conversationId?: string | undefined }
	| { kind: "bot-page"; id: string; page: ChatBotPage }
	| {
			kind: "member";
			handle: string;
			title?: string | undefined;
			conversationId?: string | undefined;
			onReturn?: (() => void) | undefined;
	  }
	| { kind: "group"; conversationId: string }
	| { kind: "page"; page: SidePage };

function entryKey(entry: SideEntry): string {
	switch (entry.kind) {
		case "bot":
			return `bot:${entry.id}`;
		case "bot-page":
			return `bot:${entry.id}:${entry.page}`;
		case "member":
			return `member:${entry.handle.trim().toLowerCase()}`;
		case "group":
			return `group:${entry.conversationId}`;
		case "page":
			return entry.page.key;
	}
}

type Entry = { key: string; value: SideEntry; opener: HTMLElement | null };
type Tab = { key: string; entries: readonly Entry[]; settings: boolean; onReturn: (() => void) | undefined };
type State = { tabs: readonly Tab[]; active: string | null; expanded: boolean };
const empty: State = { tabs: [], active: null, expanded: false };

function depthOf(state: unknown, id: string) {
	const detail = (state as { detailHistory?: { id: string; depth: number } } | null)?.detailHistory;
	return detail?.id === id ? detail.depth : 0;
}

const opener = () => (document.activeElement instanceof HTMLElement ? document.activeElement : null);

function focusAfterRemoval(target: HTMLElement | null | undefined) {
	if (!target) return;
	requestAnimationFrame(() => {
		if (target.isConnected && !target.closest("[inert], [hidden]")) target.focus({ preventScroll: true });
	});
}

function focusSelectedTab() {
	requestAnimationFrame(() =>
		document
			.querySelector<HTMLButtonElement>('[data-detail-pane] [role="tab"][aria-selected="true"]')
			?.focus({ preventScroll: true }),
	);
}

export function useDetailTabs(multiple: boolean, account: string | undefined, path: string, settings: boolean) {
	const navigate = useNavigate();
	const location = useLocation();
	const navigationType = useNavigationType();
	const historyId = useId();
	const [stored, setStored] = useState(() => ({ account, path, ...empty }));
	const [confirm, setConfirm] = useState<(() => void) | null>(null);
	const dirty = useRef(new Map<string, Set<string>>());
	const stale = stored.account !== account || (!multiple && stored.path !== path);
	// Reset before rendering another account's detail or walking away from a phone detail.
	if (stale) {
		setStored({ account, path, ...empty });
		if (confirm) setConfirm(null);
		dirty.current.clear();
	}
	const state: State = stale ? empty : stored;
	const latest = useRef({ state, account, path, multiple, settings, routerState: location.state });
	latest.current = { state, account, path, multiple, settings, routerState: location.state };

	const writeHistory = useCallback(
		(depth: number) => {
			const live = latest.current;
			if (live.multiple) return;
			const previous = depthOf(live.routerState, historyId);
			if (depth < previous) void navigate(depth - previous);
			else if (depth > previous) {
				void navigate(live.path, { state: { ...live.routerState, detailHistory: { id: historyId, depth } } });
			}
		},
		[historyId, navigate],
	);

	const update = useCallback((next: State) => {
		latest.current.state = next;
		setStored({ ...next, account: latest.current.account, path: latest.current.path });
	}, []);
	const guard = useCallback((keys: readonly string[], execute: () => void, page?: string) => {
		const changed = keys.some((key) => (page ? dirty.current.get(key)?.has(page) : dirty.current.has(key)));
		if (changed) setConfirm(() => execute);
		else execute();
	}, []);
	const remove = useCallback(
		(keys: readonly string[], write = true) => {
			const current = latest.current.state;
			const paneHadFocus = opener()?.closest("[data-detail-pane]");
			const tabs = current.tabs.filter((tab) => !keys.includes(tab.key));
			const activeIndex = current.tabs.findIndex((tab) => tab.key === current.active);
			const activeRemoved = current.active !== null && keys.includes(current.active);
			const next = activeRemoved ? tabs[Math.min(activeIndex, tabs.length - 1)]?.key : current.active;
			for (const key of keys) dirty.current.delete(key);
			update({ tabs, active: next ?? null, expanded: tabs.length > 0 && current.expanded });
			if (activeRemoved && write) writeHistory(0);
			if (activeRemoved && !tabs.length) {
				const previous = current.tabs[activeIndex];
				if (!latest.current.multiple) previous?.onReturn?.();
				focusAfterRemoval(previous?.entries[0]?.opener);
			} else if (activeRemoved && paneHadFocus) focusSelectedTab();
		},
		[update, writeHistory],
	);
	const trim = useCallback(
		(tab: Tab, depth: number) => {
			const live = latest.current.state;
			for (const entry of tab.entries.slice(depth)) dirty.current.get(tab.key)?.delete(entry.key);
			if (!dirty.current.get(tab.key)?.size) dirty.current.delete(tab.key);
			update({
				...live,
				tabs: live.tabs.map((item) => (item === tab ? { ...tab, entries: tab.entries.slice(0, depth) } : item)),
			});
			focusAfterRemoval(tab.entries[depth]?.opener);
		},
		[update],
	);
	useLayoutEffect(() => {
		if (multiple || navigationType !== "POP") return;
		const tab = latest.current.state.tabs[0];
		if (!tab) return;
		const depth = depthOf(location.state, historyId);
		if (depth === 0) remove([tab.key], false);
		else if (depth < tab.entries.length) trim(tab, depth);
	}, [location, historyId, multiple, navigationType, remove, trim]);
	const open = useCallback(
		(value: SideEntry) => {
			const key = entryKey(value);
			const current = latest.current.state;
			const before = current.tabs.find((tab) => tab.key === key);
			const source = current.tabs[0]?.entries[0]?.opener;
			const trigger = opener();
			const execute = () => {
				const { state: live, multiple, settings } = latest.current;
				const previous = live.tabs.find((tab) => tab.key === key);
				const old = previous?.entries[0]?.value;
				const data =
					old && dirty.current.has(key)
						? old
						: (value.kind === "member" || value.kind === "bot") && old?.kind === value.kind && !value.conversationId
							? { ...old, ...value, conversationId: old.conversationId }
							: value;
				const entry = {
					key,
					value: data,
					opener: previous?.entries[0]?.opener ?? (multiple ? trigger : (source ?? trigger)),
				};
				const tab: Tab = {
					key,
					entries: [entry, ...(previous?.entries.slice(1) ?? [])],
					settings,
					onReturn: multiple
						? undefined
						: (live.tabs[0]?.onReturn ?? (value.kind === "member" ? value.onReturn : undefined)),
				};
				const tabs = multiple
					? previous
						? live.tabs.map((item) => (item.key === key ? tab : item))
						: [...live.tabs, tab]
					: [tab];
				if (!multiple) for (const item of live.tabs) if (item.key !== key) dirty.current.delete(item.key);
				update({ tabs, active: key, expanded: true });
				writeHistory(tab.entries.length);
				if (multiple && trigger?.closest("[data-detail-tab-panel]")) focusSelectedTab();
			};
			if (latest.current.multiple || before) execute();
			else
				guard(
					current.tabs.map((tab) => tab.key),
					execute,
				);
		},
		[guard, update, writeHistory],
	);
	const push = useCallback(
		(value: SideEntry, tabKey?: string) => {
			const current = latest.current.state;
			const key = entryKey(value);
			const owner = tabKey ?? current.active;
			const tab = current.tabs.find((tab) => tab.key === owner);
			if (!tab) return open(value);
			if (tab.entries.at(-1)?.key === key) return;
			update({
				...current,
				tabs: current.tabs.map((item) =>
					item === tab ? { ...tab, entries: [...tab.entries, { key, value, opener: opener() }] } : item,
				),
			});
			writeHistory(tab.entries.length + 1);
		},
		[open, update, writeHistory],
	);
	const close = useCallback(
		(tabKey?: string) => {
			const key = tabKey ?? latest.current.state.active;
			if (key) guard([key], () => remove([key]));
		},
		[guard, remove],
	);
	const back = useCallback(
		(tabKey?: string, expected?: string) => {
			const current = latest.current.state;
			const tab = current.tabs.find((tab) => tab.key === (tabKey ?? current.active));
			const top = tab?.entries.at(-1);
			if (!tab || !top || (expected && top.key !== expected)) return;
			if (tab.entries.length === 1) return close(tab.key);
			guard(
				[tab.key],
				() => {
					const live = latest.current.state.tabs.find((item) => item.key === tab.key);
					if (live?.entries.at(-1)?.key !== top.key) return;
					trim(live, live.entries.length - 1);
					writeHistory(live.entries.length - 1);
				},
				top.key,
			);
		},
		[close, guard, trim, writeHistory],
	);
	const controlsFor = useCallback(
		(tabKey?: string, pageKey?: string): SidePanelControls => ({
			open: (page) => open({ kind: "page", page }),
			push: (page) => push({ kind: "page", page }, tabKey),
			openMember: (handle, title, onReturn) => open({ kind: "member", handle, title, onReturn }),
			back: (key) => back(tabKey, key),
			close: (key) => close(key ?? tabKey),
			...(tabKey && pageKey
				? {
						setDirty: (changed: boolean) => {
							const pages = dirty.current.get(tabKey) ?? new Set<string>();
							if (changed) {
								pages.add(pageKey);
								dirty.current.set(tabKey, pages);
							} else {
								pages.delete(pageKey);
								if (!pages.size) dirty.current.delete(tabKey);
							}
						},
					}
				: {}),
		}),
		[back, close, open, push],
	);
	const closeAll = () => {
		const keys = latest.current.state.tabs.map((tab) => tab.key);
		guard(keys, () => remove(keys));
	};
	const activate = (key: string) => {
		const { state, settings } = latest.current;
		const tabs = settings ? state.tabs.map((tab) => (tab.key === key ? { ...tab, settings } : tab)) : state.tabs;
		update({ tabs, active: key, expanded: true });
	};
	const move = (key: string, over: string) => {
		const live = latest.current.state;
		const next = [...live.tabs];
		const from = next.findIndex((tab) => tab.key === key);
		const to = next.findIndex((tab) => tab.key === over);
		const moved = next[from];
		if (!moved || to < 0 || from === to) return;
		next.splice(from, 1);
		next.splice(to, 0, moved);
		update({ ...live, tabs: next });
	};
	const blocksPop = useCallback(
		(next: unknown) => {
			const { multiple, state, routerState } = latest.current;
			const tab = state.tabs[0];
			if (multiple || !tab || !depthOf(routerState, historyId)) return false;
			const retained = depthOf(next, historyId);
			return tab.entries.slice(retained).some((entry) => dirty.current.get(tab.key)?.has(entry.key));
		},
		[historyId],
	);
	return {
		...state,
		open,
		push,
		back,
		close,
		closeAll,
		activate,
		move,
		collapse: () => update({ ...latest.current.state, expanded: false }),
		removeConversation: (id: string) =>
			remove(latest.current.state.tabs.filter((tab) => tab.key === `group:${id}`).map((tab) => tab.key)),
		remove,
		controlsFor,
		controls: useMemo(() => controlsFor(), [controlsFor]),
		dirty: () => dirty.current.size > 0,
		blocksPop,
		confirm,
		clearConfirmation: () => setConfirm(null),
	};
}

export type DetailTabs = ReturnType<typeof useDetailTabs>;
