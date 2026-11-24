import { ListGroup, ListRow, Logo } from "@yonder/ui-components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface AboutSectionProps {
	/** The version this bundle was built with, injected at build time. */
	appVersion: string;
	onOpenLegal: (document: "terms" | "privacy") => void;
	update?: ReactNode;
}

/**
 * 关于: the version the user can quote when reporting a problem.
 */
export function AboutSection({ appVersion, onOpenLegal, update }: AboutSectionProps) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col gap-[var(--spacing-6)]">
			<div className="flex flex-col items-center gap-[var(--spacing-2)] py-[var(--spacing-4)]">
				<Logo size={64} />
				<span className="text-h3 font-semibold text-[var(--color-text-primary)]">Yonder</span>
			</div>
			<ListGroup>
				<Row label={t("me.about.version")} value={appVersion} testId="about-version" />
			</ListGroup>
			{update}
			<ListGroup>
				<ListRow title={t("me.about.terms")} chevron onClick={() => onOpenLegal("terms")} />
				<ListRow title={t("me.about.privacy")} chevron onClick={() => onOpenLegal("privacy")} />
			</ListGroup>
		</div>
	);
}

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
	return (
		<li className="group/row relative flex min-h-[var(--row-height)] items-center justify-between gap-[var(--spacing-3)] px-[var(--spacing-4)]">
			<span className="text-body text-[var(--color-text-primary)]">{label}</span>
			<span className="font-mono text-caption text-[var(--color-text-tertiary)] tabular-nums" data-testid={testId}>
				{value}
			</span>
			<span className="pointer-events-none absolute end-0 bottom-0 start-[var(--spacing-4)] h-px bg-[var(--color-border-subtle)] group-last/row:hidden" />
		</li>
	);
}
