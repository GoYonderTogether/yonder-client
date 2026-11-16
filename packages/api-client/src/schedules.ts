import type { CreateScheduleRequest, Schedule, ScheduleListResponse, UpdateScheduleRequest } from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

export function scheduleEndpoints(client: ApiClient) {
	return {
		schedules(): Promise<ScheduleListResponse> {
			return client.request("/v1/schedules");
		},
		schedule(id: string): Promise<Schedule> {
			return client.request(`/v1/schedules/${encodeURIComponent(id)}`);
		},
		createSchedule(body: CreateScheduleRequest): Promise<Schedule> {
			return client.request("/v1/schedules", { body });
		},
		updateSchedule(id: string, body: UpdateScheduleRequest): Promise<Schedule> {
			return client.request(`/v1/schedules/${encodeURIComponent(id)}`, { method: "PATCH", body });
		},
		pauseSchedule(id: string): Promise<Schedule> {
			return client.request(`/v1/schedules/${encodeURIComponent(id)}/pause`, { body: {} });
		},
		resumeSchedule(id: string): Promise<Schedule> {
			return client.request(`/v1/schedules/${encodeURIComponent(id)}/resume`, { body: {} });
		},
		deleteSchedule(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
		},
	};
}
