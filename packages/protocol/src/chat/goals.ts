export type GoalState = "proposed" | "active" | "paused" | "achieved" | "stopped";
export type GoalAction = "confirm" | "pause" | "resume" | "complete" | "stop" | "progress";
export type OnboardingStep = "you" | "bot" | "connect";

export interface GoalProgress {
	wrote: boolean;
	connected: boolean;
	planned: boolean;
}

export interface Goal {
	id: string;
	botId: string;
	conversationId: string;
	title: string;
	outcome: string;
	progress: string | null;
	nextStep: string | null;
	state: GoalState;
	system: "onboarding" | null;
	milestones?: GoalProgress;
	changedAt: string;
	transfers?: { from: string; to: string; at: string }[];
}

export interface GoalChange {
	action: GoalAction;
	progress?: string;
	nextStep?: string;
}
