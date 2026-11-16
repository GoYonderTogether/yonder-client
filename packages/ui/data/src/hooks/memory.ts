import { useQuery } from "@tanstack/react-query";
import { keys } from "../query/keys.ts";
import { useApi } from "../query/provider.tsx";

/** Recent days in full when `month` is null; otherwise every day of that older month. */
export function useMemoryDays(month: string | null = null, enabled = true) {
	const api = useApi();
	return useQuery({
		queryKey: keys.memory.days(month ?? "recent"),
		queryFn: () => api.memoryDays(month ?? undefined),
		enabled,
		staleTime: 60_000,
	});
}

export function useMemoryMonths() {
	const api = useApi();
	return useQuery({ queryKey: keys.memory.months(), queryFn: () => api.memoryMonths(), staleTime: 5 * 60_000 });
}

export function useMemoryRef(id: string | null) {
	const api = useApi();
	return useQuery({
		queryKey: keys.memory.ref(id ?? ""),
		queryFn: () => api.memoryRef(id ?? ""),
		enabled: Boolean(id),
		staleTime: 60_000,
	});
}
