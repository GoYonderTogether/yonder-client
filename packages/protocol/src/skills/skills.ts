/** Cloud skills contain UTF-8 text files; scripts are resources, never executed by reading. */
export interface SkillSummary {
	id: string;
	name: string;
	displayNameZh?: string;
	description: string;
	source: "platform" | "user";
	enabled: boolean;
	revision: string;
	canEdit: boolean;
	files: string[];
	updatedAt: string;
}

export type SkillDetail = SkillSummary;
export interface SkillListResponse {
	items: SkillSummary[];
}
export interface SkillFileResponse {
	id: string;
	revision: string;
	path: string;
	content: string;
}
export interface SaveSkillRequest {
	files: Record<string, string>;
}
export interface UpdateSkillRequest {
	expectedRevision?: string;
	enabled?: boolean;
	files?: Record<string, string>;
}
