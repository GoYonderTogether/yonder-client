import { isMeSection, type MeSectionId } from "@yonder/feature-me";
import type { Storage } from "@yonder/ui-data";
import { useEffect } from "react";

/** Remember a section on this device, never an editor or other nested page. */
export function useMeEntry(storage: Storage, personId: string | undefined, section: MeSectionId | null): string {
	const key = personId ? `me-section.${personId}` : null;
	const stored = key ? storage.get(key) : null;
	useEffect(() => {
		if (key && section) storage.set(key, section);
	}, [key, section, storage]);
	return `/me/${isMeSection(stored ?? undefined) ? stored : "profile"}`;
}
