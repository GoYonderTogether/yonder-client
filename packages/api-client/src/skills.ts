import type {
	SaveSkillRequest,
	SkillDetail,
	SkillFileResponse,
	SkillListResponse,
	UpdateSkillRequest,
} from "@yonder/protocol";
import type { ApiClient } from "./client.ts";

/** Skills the account owns or installed. */
export function skillEndpoints(client: ApiClient) {
	return {
		skills(): Promise<SkillListResponse> {
			return client.request("/v1/skills");
		},

		skill(id: string): Promise<SkillDetail> {
			return client.request(`/v1/skills/${encodeURIComponent(id)}`);
		},

		skillFile(id: string, path: string): Promise<SkillFileResponse> {
			return client.request(`/v1/skills/${encodeURIComponent(id)}/files?path=${encodeURIComponent(path)}`);
		},

		createSkill(body: SaveSkillRequest): Promise<SkillDetail> {
			return client.request("/v1/skills", { body });
		},

		updateSkill(id: string, body: UpdateSkillRequest): Promise<SkillDetail> {
			return client.request(`/v1/skills/${encodeURIComponent(id)}`, { method: "PATCH", body });
		},

		deleteSkill(id: string): Promise<{ ok: true }> {
			return client.request(`/v1/skills/${encodeURIComponent(id)}`, { method: "DELETE" });
		},
	};
}
