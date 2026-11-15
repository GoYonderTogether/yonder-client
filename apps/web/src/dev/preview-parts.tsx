import type { FieldSize } from "@yonder/ui-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export const sizes: readonly FieldSize[] = ["sm", "md", "lg"];
export const states = ["default", "hover", "active", "focus", "disabled", "loading", "error"] as const;
export type PreviewState = (typeof states)[number];
export const interactionStates: readonly PreviewState[] = ["default", "hover", "active", "focus", "disabled"];
export const fieldStates: readonly PreviewState[] = ["default", "hover", "focus", "disabled", "error"];

export function Section({ name, children }: { name: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-[var(--spacing-4)]">
			<h2 className="text-h2 font-semibold text-[var(--color-text-primary)]">{name}</h2>
			{children}
		</section>
	);
}

export function StateRow({
	label,
	supported,
	render,
	minWidth = "10rem",
}: {
	label: string;
	supported: readonly PreviewState[];
	render: (state: PreviewState) => ReactNode;
	minWidth?: string;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col gap-[var(--spacing-2)]">
			<h3 className="text-caption font-semibold text-[var(--color-text-secondary)]">{label}</h3>
			<div
				className="grid gap-[var(--spacing-3)]"
				style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minWidth}), 1fr))` }}
			>
				{states.map((state) => (
					<div
						key={state}
						data-preview-state={state}
						className="flex min-w-0 flex-col items-start gap-[var(--spacing-1)]"
					>
						<span className="text-micro text-[var(--color-text-secondary)]">{t(`dev.states.${state}`)}</span>
						{supported.includes(state) ? (
							render(state)
						) : (
							<span className="text-caption text-[var(--color-text-tertiary)]">{t("dev.notApplicable")}</span>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
