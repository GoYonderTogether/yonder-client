/**
 * Token counts as people write them: `1M`, `200K`, `128000` or `1,000,000`. A bare count of a million
 * is a row of zeros nobody can check by eye, so the form accepts and shows K and M, and stores the
 * plain integer. K and M are decimal (1K = 1000), as providers and catalogs publish their limits.
 */
export function parseTokens(input: string): number | null {
	const match = /^\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([km]?)\s*(?:tokens?)?\s*$/i.exec(input);
	if (!match) return null;
	const base = Number((match[1] as string).replace(/,/g, ""));
	const unit = (match[2] ?? "").toLowerCase();
	const value = Math.round(base * (unit === "m" ? 1_000_000 : unit === "k" ? 1_000 : 1));
	return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** The shortest exact spelling: `1M`, `200K`, or the plain number when no unit divides it evenly. */
export function formatTokens(value: number): string {
	if (value >= 1_000_000 && value % 100_000 === 0) return `${value / 1_000_000}M`;
	if (value >= 1_000 && value % 1_000 === 0) return `${value / 1_000}K`;
	return String(value);
}
