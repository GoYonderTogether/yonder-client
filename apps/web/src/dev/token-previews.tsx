import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Section } from "./preview-parts.tsx";

const typeNames = [
	["display", "text-display"],
	["title", "text-title"],
	["h1", "text-h1"],
	["h2", "text-h2"],
	["h3", "text-h3"],
	["body", "text-body"],
	["caption", "text-caption"],
	["micro", "text-micro"],
] as const;

type Color = [number, number, number, number];

function parseColor(value: string): Color | null {
	const hex = /^#([0-9a-f]{6})$/i.exec(value);
	if (hex?.[1]) {
		const number = Number.parseInt(hex[1], 16);
		return [(number >> 16) & 255, (number >> 8) & 255, number & 255, 1];
	}
	if (!value.startsWith("rgb")) return null;
	const parts = value.match(/\d+(?:\.\d+)?/g)?.map(Number);
	if (!parts || parts.length < 3) return null;
	return [parts[0] as number, parts[1] as number, parts[2] as number, parts[3] ?? 1];
}

function luminance(color: readonly number[]): number {
	const linear = color.map((channel) => {
		const srgb = channel / 255;
		return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
	});
	return (linear[0] as number) * 0.2126 + (linear[1] as number) * 0.7152 + (linear[2] as number) * 0.0722;
}

function contrast(value: string, background: string): string | null {
	const fg = parseColor(value);
	const bg = parseColor(background);
	if (!fg || !bg) return null;
	const blended = fg.slice(0, 3).map((channel, index) => channel * fg[3] + (bg[index] as number) * (1 - fg[3]));
	const [a, b] = [luminance(blended), luminance(bg.slice(0, 3))].sort((x, y) => y - x);
	return (((a as number) + 0.05) / ((b as number) + 0.05)).toFixed(2);
}

export function TokenPreviews({ theme }: { theme: "light" | "dark" }) {
	const { t } = useTranslation();
	const root = useRef<HTMLDivElement>(null);
	const [values, setValues] = useState<Record<string, string>>({});
	useLayoutEffect(() => {
		if (!root.current || root.current.dataset.theme !== theme) return;
		const computed = getComputedStyle(root.current);
		const names = Array.from(computed).filter((name) => name.startsWith("--"));
		setValues(Object.fromEntries(names.map((name) => [name, computed.getPropertyValue(name).trim()])));
	}, [theme]);
	const allTokens = Object.keys(values).sort();
	const colors = allTokens.filter((name) => name.startsWith("--color-"));
	const radii = allTokens.filter((name) => name.startsWith("--radius-"));
	const spacing = allTokens
		.filter((name) => /^--spacing-\d+$/.test(name))
		.sort((a, b) => Number(a.slice(10)) - Number(b.slice(10)));
	const shadows = allTokens.filter((name) => name.startsWith("--shadow-"));
	const durations = allTokens.filter((name) => name.startsWith("--duration-"));
	const background = values["--color-bg-base"] ?? "";
	return (
		<div ref={root} data-theme={theme} className="flex flex-col gap-[var(--spacing-10)]">
			<Section name={t("dev.colors")}>
				<div
					className="grid gap-[var(--spacing-3)]"
					style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 12rem), 1fr))" }}
				>
					{colors.map((name) => {
						const ratio = contrast(values[name] ?? "", background);
						return (
							<div
								key={name}
								className="flex min-w-0 flex-col gap-[var(--spacing-1)] text-caption text-[var(--color-text-secondary)]"
							>
								<div className="h-10 rounded-[var(--radius-control-sm)]" style={{ backgroundColor: `var(${name})` }} />
								<code className="break-all text-[var(--color-text-primary)]">{t("dev.value", { value: name })}</code>
								<span>{t("dev.value", { value: values[name] ?? "" })}</span>
								<span>{ratio ? t("dev.contrast", { ratio }) : t("dev.notApplicable")}</span>
							</div>
						);
					})}
				</div>
			</Section>

			<Section name={t("dev.type")}>
				{typeNames.map(([name, className]) => (
					<div key={name} className="flex flex-col gap-[var(--spacing-1)]">
						<code className="text-caption text-[var(--color-text-secondary)]">
							{t("dev.value", {
								value: `--text-${name} · ${values[`--text-${name}`] ?? ""} / ${values[`--text-${name}--line-height`] ?? ""}`,
							})}
						</code>
						<span className={className}>{t("dev.sample.type")}</span>
					</div>
				))}
			</Section>

			<Section name={t("dev.radii")}>
				<div className="flex flex-wrap gap-[var(--spacing-4)]">
					{radii.map((name) => (
						<div
							key={name}
							className="flex flex-col gap-[var(--spacing-1)] text-caption text-[var(--color-text-secondary)]"
						>
							<div className="size-16 bg-[var(--color-bg-subtle)]" style={{ borderRadius: `var(${name})` }} />
							<code>{t("dev.value", { value: name })}</code>
							<span>{t("dev.value", { value: values[name] ?? "" })}</span>
						</div>
					))}
				</div>
			</Section>

			<Section name={t("dev.spacing")}>
				{spacing.map((name) => (
					<div
						key={name}
						className="flex items-center gap-[var(--spacing-3)] text-caption text-[var(--color-text-secondary)]"
					>
						<span className="h-4 shrink-0 bg-[var(--color-accent)]" style={{ width: `var(${name})` }} />
						<code>{t("dev.value", { value: `${name} · ${values[name] ?? ""}` })}</code>
					</div>
				))}
			</Section>

			<Section name={t("dev.shadows")}>
				<div className="flex flex-wrap gap-[var(--spacing-6)]">
					{shadows.map((name) => (
						<div
							key={name}
							className="flex flex-col gap-[var(--spacing-2)] text-caption text-[var(--color-text-secondary)]"
						>
							<div
								className="size-16 rounded-[var(--radius-card)] bg-[var(--color-bg-raised)]"
								style={{ boxShadow: `var(${name})` }}
							/>
							<code>{t("dev.value", { value: name })}</code>
						</div>
					))}
				</div>
			</Section>

			<Section name={t("dev.motion")}>
				{durations.map((name) => (
					<code key={name} className="text-caption text-[var(--color-text-secondary)]">
						{t("dev.value", { value: `${name} · ${values[name] ?? ""}` })}
					</code>
				))}
			</Section>
		</div>
	);
}
