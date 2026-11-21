import { MAIN_CONVERSATION } from "@yonder/ui-shell";

/** Every device opens on the main Bot; on a phone it is the first tab. */
export function defaultMessagePath() {
	return `/messages/${MAIN_CONVERSATION}`;
}
