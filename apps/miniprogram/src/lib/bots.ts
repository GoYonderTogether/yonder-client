import type { Member } from "@yonder/protocol";
import { sortOwnedBots } from "./member-cache";
import { api } from "./runtime";

/**
 * The Bots this account owns. There is no `/v1/bots` listing: `/v1/contacts` already includes
 * every member owned by the caller (the server lists `owner_member_id = me OR a contact`), and
 * each carries `ownerId` and `isDefault`, so the Bot list is that response filtered.
 */
export async function listOwnedBots(meId: string): Promise<Member[]> {
	const { items } = await api.contacts();
	return sortOwnedBots(items.filter((member) => member.kind === "bot" && member.ownerId === meId));
}

/** One Bot I own; `undefined` when it is gone (deleted on another device) or is not mine. */
export async function loadOwnedBot(meId: string, id: string): Promise<Member | undefined> {
	if (!id) return undefined;
	return (await listOwnedBots(meId)).find((bot) => bot.id === id);
}
