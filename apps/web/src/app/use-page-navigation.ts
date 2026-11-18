import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";

export interface PageNavigationState {
	tabLocation?: string;
	channelOriginBotId?: string;
	channelParentPath?: string;
}

/** Return through entries we actually visited; a deep link replaces itself with its parent. */
export function usePageNavigation(tabLocation: string) {
	const location = useLocation();
	const navigate = useNavigate();
	const action = useNavigationType();
	const path = `${location.pathname}${location.search}${location.hash}`;
	const state = location.state as PageNavigationState | null;
	const history = useRef({ entries: [{ key: location.key, path, state }], index: 0 });
	// A layer that is animating out still holds the route it had when it left, and a second Escape
	// can arrive before React re-renders. The exit therefore follows the destination this hook last
	// asked the router for, updated in the same tick as the navigation itself.
	const live = useRef({ pathname: location.pathname, state });
	live.current = { pathname: location.pathname, state };
	useLayoutEffect(() => {
		const stack = history.current;
		if (stack.entries[stack.index]?.key === location.key) return;
		const entry = { key: location.key, path, state };
		if (action === "PUSH") {
			stack.entries.splice(stack.index + 1, stack.entries.length, entry);
			stack.index += 1;
		} else if (action === "REPLACE") {
			stack.entries[stack.index] = entry;
		} else {
			const index = stack.entries.findIndex((item) => item.key === location.key);
			if (index >= 0) stack.index = index;
			else history.current = { entries: [entry], index: 0 };
		}
	}, [action, location.key, path, state]);
	return {
		/** The route the router is on right now, for exits triggered from a departing layer. */
		current: () => live.current.pathname,
		currentState: () => live.current.state,
		open: (target: string, context?: Omit<PageNavigationState, "tabLocation">) => {
			const state = { ...context, tabLocation };
			live.current = { pathname: target.split(/[?#]/)[0] ?? target, state };
			navigate(target, { state });
		},
		back: (parent: string, context?: Omit<PageNavigationState, "tabLocation">) => {
			const stack = history.current;
			const index = stack.entries.slice(0, stack.index).findLastIndex((entry) => entry.path === parent);
			// The destination is the visited entry when there is one, the semantic parent otherwise.
			const entry = stack.entries[index];
			const destination = entry?.path ?? parent;
			const state = entry ? entry.state : { ...context, tabLocation };
			live.current = { pathname: destination.split(/[?#]/)[0] ?? destination, state };
			return index >= 0 ? navigate(index - stack.index) : navigate(parent, { replace: true, state });
		},
	};
}
