export interface MemoryOrganizationMove {
	fileId: string;
	from: string;
	to: string;
	title: string;
	draft?: boolean;
}

export interface MemoryOrganizationPlan {
	id: string;
	createdAt: string;
	moves: MemoryOrganizationMove[];
}

export interface MemoryOrganizationResponse {
	plan: MemoryOrganizationPlan | null;
}

export interface ReviewMemoryOrganizationRequest {
	planId: string;
	/** The owner's selected destinations. An empty selection dismisses the plan. */
	moves: Pick<MemoryOrganizationMove, "fileId" | "to">[];
}
