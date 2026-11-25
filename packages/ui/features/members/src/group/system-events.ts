import type { GroupSystemEvent, SystemEvent } from "@yonder/protocol";
import type { useTranslation } from "react-i18next";

/**
 * The reader's language is the only thing this needs from i18n, so it takes the translate function
 * rather than importing an instance: the same call works on the web, in a shell and in a test. The
 * type is derived from `useTranslation` so a component can pass `t` without a cast.
 */
export type Translate = ReturnType<typeof useTranslation>["t"];

const SEPARATOR_KEY = "members.events.separator";
const SOMEONE_KEY = "members.events.someone";

function names(event: GroupSystemEvent): string[] {
	return event.targetNames.filter((name) => name.trim() !== "");
}

/**
 * A group lifecycle message as a sentence (19 第三节). The server stores the event and the names as
 * they were at that moment; the sentence is built here so the same row reads correctly in Chinese
 * and in English. An event with nobody to name still says something true rather than rendering an
 * empty gap.
 */
export function systemEventText(event: SystemEvent, t: Translate): string {
	if (event.event === "memory_updated") {
		const [only] = event.changes;
		return event.changes.length === 1 && only
			? t("chat.memoryUpdatedOne", { title: only.title || only.path })
			: t("chat.memoryUpdatedMany", { count: event.changes.length });
	}
	if (event.event === "model_fallback") {
		// The owner's own provider could not answer; the account is on the platform model until `until`.
		return t("chat.modelFallback", {
			provider: event.providerName,
			model: event.model,
			fallback: event.fallbackModel,
		});
	}
	if (event.event === "photo_archive_plan") {
		const { paused, months, until } = event.plan;
		if (paused) return t("chat.photoArchive.paused");
		const list = months?.length ? months.join(t(SEPARATOR_KEY)) : "";
		if (list && until) return t("chat.photoArchive.chosenUntil", { months: list, month: until });
		if (list) return t("chat.photoArchive.chosen", { months: list });
		if (until) return t("chat.photoArchive.until", { month: until });
		return t("chat.photoArchive.resumed");
	}
	if (event.event === "photo_archive") {
		if (event.state === "finished") return t("chat.photoArchive.finished", { count: event.months });
		const [year = "", month = ""] = (event.month ?? "").split("-");
		const at = t("chat.photoArchive.month", { year, month: String(Number(month)) });
		return event.state === "stopped"
			? t("chat.photoArchive.stopped", { at, count: event.months })
			: t("chat.photoArchive.ended", { at, count: event.months });
	}
	const actor = event.actorName?.trim() || t(SOMEONE_KEY);
	const people = names(event);
	const joined = people.length > 0 ? people.join(t(SEPARATOR_KEY)) : t(SOMEONE_KEY);
	switch (event.event) {
		case "removed":
			return t("members.events.removed", { actor, names: joined });
		case "dissolved":
			return t("members.events.dissolved");
		case "joined":
			return t("members.events.joined", { names: joined });
		case "created":
			return people.length > 0
				? t("members.events.createdWithMembers", { actor, names: joined })
				: t("members.events.created", { actor });
		case "renamed":
			return t("members.events.renamed", { actor, title: event.title ?? "" });
		case "owner_changed":
			return t("members.events.ownerChanged", { names: joined });
		default:
			return "";
	}
}

/**
 * Why a group can be read but not written to, from this reader's side: the words the user asked
 * for by name (R13: 该群聊已被解散), and the honest reason a removed member sees instead.
 */
export function closedGroupNotice(reason: "dissolved" | "removed" | null | undefined, t: Translate): string | null {
	if (reason === "dissolved") return t("members.closed.dissolved");
	if (reason === "removed") return t("members.closed.removed");
	return null;
}
