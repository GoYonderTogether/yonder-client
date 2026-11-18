import type { QueryClient } from "@tanstack/react-query";
import { keys } from "./keys.ts";

/** Invalidate details, histories and any directory listing that includes a changed path. */
export function invalidateMemoryFiles(client: QueryClient, paths: string[]) {
	return Promise.all([
		client.invalidateQueries({
			queryKey: keys.memory.fileLists(),
			predicate: ({ queryKey }) => {
				const prefix = queryKey[2];
				return typeof prefix === "string" && paths.some((path) => path.startsWith(prefix));
			},
		}),
		...paths.map((path) => client.invalidateQueries({ queryKey: keys.memory.file(path) })),
	]);
}
