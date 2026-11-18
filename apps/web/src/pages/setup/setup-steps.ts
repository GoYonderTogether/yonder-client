/**
 * The first-run steps after an account is created (18 新用户引导): who the Bot should call you, a
 * name for your Bot, and what to connect. The last one exists only where something can be connected.
 */
export const SETUP_STEPS = ["you", "bot", "connect"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export function isSetupStep(value: string | undefined): value is SetupStep {
	return (SETUP_STEPS as readonly string[]).includes(value ?? "");
}

/** The steps this device really has: connecting is dropped when nothing can be connected here. */
export function stepsFor(canConnect: boolean): readonly SetupStep[] {
	return canConnect ? SETUP_STEPS : SETUP_STEPS.filter((step) => step !== "connect");
}

/** The step after `step`, or null when the flow ends and the app opens. */
export function nextStep(step: SetupStep, canConnect: boolean): SetupStep | null {
	const steps = stepsFor(canConnect);
	return steps[steps.indexOf(step) + 1] ?? null;
}

/** The step before `step`, or null on the first one. */
export function previousStep(step: SetupStep, canConnect: boolean): SetupStep | null {
	const steps = stepsFor(canConnect);
	return steps[steps.indexOf(step) - 1] ?? null;
}

export const setupPath = (step: SetupStep) => `/setup/${step}`;
