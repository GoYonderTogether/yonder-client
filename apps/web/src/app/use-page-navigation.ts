import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";

/** Return through entries we actually visited; a deep link replaces itself with its parent. */
export function usePageNavigation(tabLocation: string) {
	const location = useLocation();
	const navigate = useNavigate();
	const action = useNavigationType();
	const path = `${location.pathname}${location.search}${location.hash}`;
	const history = useRef({ entries: [{ key: location.key, path }], index: 0 });
	useLayoutEffect(() => {
		const stack = history.current;
		if (stack.entries[stack.index]?.key === location.key) return;
		const entry = { key: location.key, path };
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
	}, [action, location.key, path]);
	return {
		open: (target: string) => navigate(target, { state: { tabLocation } }),
		back: (parent: string) => {
			const stack = history.current;
			const index = stack.entries.slice(0, stack.index).findLastIndex((entry) => entry.path === parent);
			return index >= 0 ? navigate(index - stack.index) : navigate(parent, { replace: true, state: { tabLocation } });
		},
	};
}
