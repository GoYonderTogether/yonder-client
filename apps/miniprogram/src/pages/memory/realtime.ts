import type { ServerEvent } from "@yonder/protocol";

export function affectsMemory(event: ServerEvent, path?: string): boolean {
	if (event.type !== "memory.changed") return false;
	if (event.dates === undefined && event.paths === undefined) return true;
	return path === undefined ? Boolean(event.dates?.length) : Boolean(event.paths?.includes(path));
}
