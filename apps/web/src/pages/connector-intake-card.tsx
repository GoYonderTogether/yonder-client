import type { ConnectorIntakeCard as IntakeFacts } from "@yonder/protocol";
import { AudioLines, CalendarDays, ChevronRight, FolderSearch, Images, NotebookPen } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

/**
 * The connector presentation is owned by the connector settings page; the intake card shows the
 * same icon for the same connector so the owner recognises where it came from.
 */
const PRESENTATION: Record<string, { icon: typeof FolderSearch; key: string }> = {
	"apple-calendar": { icon: CalendarDays, key: "appleCalendar" },
	"apple-photos": { icon: Images, key: "applePhotos" },
	"apple-notes": { icon: NotebookPen, key: "appleNotes" },
	"apple-voice-memos": { icon: AudioLines, key: "appleVoiceMemos" },
};

/**
 * The first message of a connector's import session (PLAN.md 4.2-G): a visible system card, drawn
 * from the server's facts only. The name comes from the catalog's label in the reader's language
 * when it is known; a connector the client does not know yet still states its id, device and range.
 * A connector intake is a status, not a tap into another page: the session follows the card.
 */
export function ConnectorIntakeMessageCard({
	intake,
	sessionId,
	onOpen,
}: {
	intake: IntakeFacts;
	/** The import session this card heads; the card opens it when both are given. */
	sessionId?: string;
	onOpen?: (id: string) => void;
}) {
	const { t } = useTranslation();
	const detailsId = useId();
	const known = PRESENTATION[intake.connectorId];
	const Icon = known?.icon ?? FolderSearch;
	const name = known ? t(`connectors.${known.key}.name`) : intake.name;
	const range = [
		intake.window.pastDays ? t("chat.connectorIntake.past", { count: intake.window.pastDays }) : null,
		intake.window.futureDays ? t("chat.connectorIntake.ahead", { count: intake.window.futureDays }) : null,
	]
		.filter(Boolean)
		.join(t("members.events.separator"));
	const details = [intake.deviceName, range].filter(Boolean).join(" · ");
	const body = (
		<>
			<Icon aria-hidden="true" size={20} className="shrink-0 text-[var(--color-accent-text)]" />
			<span className="min-w-0 flex-1 text-body font-medium">
				<span className="block truncate">{t("chat.connectorIntake.title", { name })}</span>
				<span id={detailsId} className="block truncate text-caption font-normal text-[var(--color-text-secondary)]">
					{details}
				</span>
			</span>
			<ChevronRight aria-hidden="true" size={18} className="shrink-0 text-[var(--color-text-secondary)]" />
		</>
	);
	const className =
		"flex min-h-[var(--control-lg)] w-full max-w-[calc(var(--control-lg)*7)] items-center gap-[var(--spacing-3)] rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-raised)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-start text-[var(--color-text-primary)]";
	// The card opens the import's own session when the page can navigate; without a session handle it
	// still states the facts, as a plain panel rather than a dead button.
	return onOpen && sessionId ? (
		<button
			type="button"
			data-connector-intake-card
			aria-describedby={details ? detailsId : undefined}
			className={`${className} hover:bg-[var(--color-bg-hover)]`}
			onClick={() => onOpen(sessionId)}
		>
			{body}
		</button>
	) : (
		<div data-connector-intake-card className={className}>
			{body}
		</div>
	);
}
