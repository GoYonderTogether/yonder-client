import { useState } from "react";

export function formatExact(value: number, locale: string, signed = false): string {
	return new Intl.NumberFormat(locale, signed ? { signDisplay: "exceptZero" } : {}).format(value);
}

export function formatCompact(value: number, locale: string, signed = false): string {
	if (Math.abs(value) <= 10_000) return formatExact(value, locale, signed);
	if (locale.startsWith("zh")) {
		const unit = Math.abs(value) >= 100_000_000 ? 100_000_000 : 10_000;
		const number = new Intl.NumberFormat(locale, {
			maximumFractionDigits: 1,
			...(signed ? { signDisplay: "exceptZero" } : {}),
		}).format(value / unit);
		return `${number} ${unit === 10_000 ? "万" : "亿"}`;
	}
	return new Intl.NumberFormat(locale, {
		notation: "compact",
		maximumFractionDigits: 1,
		...(signed ? { signDisplay: "exceptZero" } : {}),
	}).format(value);
}

/** Large values expose their exact number by both hover and tap. */
export function QuotaNumber({ value, locale, signed = false }: { value: number; locale: string; signed?: boolean }) {
	const [expanded, setExpanded] = useState(false);
	const exact = formatExact(value, locale, signed);
	if (Math.abs(value) <= 10_000) return <span className="tabular-nums">{exact}</span>;
	return (
		<button
			type="button"
			title={exact}
			aria-label={exact}
			onClick={() => setExpanded(!expanded)}
			className="tabular-nums focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
		>
			{expanded ? exact : formatCompact(value, locale, signed)}
		</button>
	);
}
