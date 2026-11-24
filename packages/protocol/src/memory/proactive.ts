export const PROACTIVE_CATEGORIES = ["calendar", "project", "goal", "watch", "platform", "reminder"] as const;
export type ProactiveCategory = (typeof PROACTIVE_CATEGORIES)[number];

/** Local wall-clock minutes; end earlier than start means the range crosses midnight. */
export interface ProactiveTimeWindow {
	startMinute: number;
	endMinute: number;
}
export interface ProactivePreferences {
	version: number;
	enabled: boolean;
	/** Read-only from the account's current timezone; null means unknown. */
	timeZone: string | null;
	awake: ProactiveTimeWindow;
	quiet: ProactiveTimeWindow[];
	normalLimit: number;
	nonUrgentLimit: number;
	mutedCategories: ProactiveCategory[];
}
export type UpdateProactivePreferencesRequest = Pick<ProactivePreferences, "version"> &
	Partial<Omit<ProactivePreferences, "version" | "timeZone">>;
