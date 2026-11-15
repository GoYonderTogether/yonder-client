/**
 * `cn` — join class names, dropping falsy entries. One function because every component needs it
 * and none of them should carry a dependency for it.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
	return values.filter((value): value is string => Boolean(value)).join(" ");
}
