import type { MemoryDayList, MemoryMonthList, MemoryRefDetail } from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

export function memoryEndpoints(client: ApiClient) {
	return {
		/** Recent days in full; pass `month` (`YYYY-MM`) for one older month. */
		memoryDays(month?: string): Promise<MemoryDayList> {
			return client.request(`/v1/memory/days${month ? `?month=${encodeURIComponent(month)}` : ""}`);
		},
		memoryMonths(): Promise<MemoryMonthList> {
			return client.request("/v1/memory/months");
		},
		memoryRef(id: string): Promise<MemoryRefDetail> {
			return client.request(`/v1/memory/refs/${encodeURIComponent(id)}`);
		},
	};
}
