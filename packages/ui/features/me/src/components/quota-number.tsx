import { useState } from "react";

export function formatExact(value: number, locale: string, signed = false): string {
	return new Intl.NumberFormat(locale, signed ? { signDisplay: "exceptZero" } : {}).format(value);
}

/**
 * Every quota figure on every screen reads in one unit, millions (`M`), because one million quota is
 * one yuan and the published prices are per million tokens. A balance keeps one decimal; a single
 * reply or task, which is usually a fraction of a million, keeps three; anything smaller than a
 * thousandth of a million says so rather than rounding to a misleading zero.
 */
export function formatQuota(value: number, locale: string, signed = false): string {
	const abs = Math.abs(value);
	if (abs === 0) return "0";
	if (abs < 1_000) return `${value < 0 ? "-" : signed ? "+" : ""}<0.001M`;
	const number = new Intl.NumberFormat(locale, {
		maximumFractionDigits: abs >= 1_000_000 ? 1 : 3,
		...(signed ? { signDisplay: "exceptZero" } : {}),
	}).format(value / 1_000_000);
	return `${number}M`;
}

/**
 * Token counts read in the same unit as quota, millions, once they are large enough for the unit to
 * help; a small count stays a plain number. Tokens are not quota: an output token costs several
 * times an input one, so the two are always labelled, never summed.
 */
export function formatTokens(value: number, locale: string): string {
	if (Math.abs(value) < 100_000) return formatExact(Math.round(value), locale);
	return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value / 1_000_000)}M`;
}

/** An Asia/Shanghai day (`YYYY-MM-DD`) as the reader writes a date, without a year. */
export function formatDay(date: string, locale: string, weekday = false): string {
	return new Intl.DateTimeFormat(locale, {
		month: "numeric",
		day: "numeric",
		...(weekday ? { weekday: "short" } : {}),
		timeZone: "Asia/Shanghai",
	}).format(new Date(`${date}T12:00:00+08:00`));
}

/** A quota figure in millions; hover or tap shows the exact number behind it. */
export function QuotaNumber({ value, locale, signed = false }: { value: number; locale: string; signed?: boolean }) {
	const [expanded, setExpanded] = useState(false);
	const exact = formatExact(value, locale, signed);
	return (
		<button
			type="button"
			title={exact}
			aria-label={exact}
			onClick={(event) => {
				// Inside a tappable row the number is its own control, not a second way into the row.
				event.stopPropagation();
				setExpanded(!expanded);
			}}
			className="tabular-nums focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
		>
			{expanded ? exact : formatQuota(value, locale, signed)}
		</button>
	);
}
