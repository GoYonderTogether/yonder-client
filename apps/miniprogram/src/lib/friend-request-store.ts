import type { FriendRequest } from "@yonder/protocol";

/** Request history never derives its state from the current contact relationship. */
export function createFriendRequestStore() {
	let items: FriendRequest[] = [];
	const listeners = new Set<() => void>();
	return {
		snapshot: () => items,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		merge(incoming: FriendRequest[]) {
			const next = new Map(items.map((item) => [item.id, item]));
			for (const item of incoming) {
				const old = next.get(item.id);
				if (!old || old.version < item.version) next.set(item.id, item);
			}
			items = [...next.values()];
			for (const listener of listeners) listener();
		},
	};
}
let current: { owner: string; store: ReturnType<typeof createFriendRequestStore> } | undefined;
export function friendRequestStore(owner: string) {
	if (current?.owner !== owner) current = { owner, store: createFriendRequestStore() };
	return current.store;
}
