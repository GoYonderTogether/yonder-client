import { MAIN_CONVERSATION } from "@yonder/ui-shell";
import { isTauri } from "./keychain.ts";
import { isDesktopExperience } from "./platform.ts";

export function defaultMessagePath() {
	return isTauri() && !isDesktopExperience() ? "/messages" : `/messages/${MAIN_CONVERSATION}`;
}
