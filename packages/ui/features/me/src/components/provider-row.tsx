import type { Provider } from "@yonder/protocol";
import { Button, IconButton, IconTile, ListOption } from "@yonder/ui-components";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { Cloud, Laptop, MoreHorizontal, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * One provider of the person's own. The heading is only what they named it — its note when they wrote
 * one, and an icon saying whether the call leaves from the cloud or from one of their devices. The
 * provider's models are a single-choice list underneath: picking one answers with that provider and
 * that model, and picking elsewhere (or an official model above) takes the choice away again.
 */
export function ProviderRow({
	provider,
	chosenModel,
	busy,
	notice,
	onChoose,
	onEdit,
	onDuplicate,
	onTest,
	onDelete,
}: {
	provider: Provider;
	/** The model this provider answers with, when it is the one in use. */
	chosenModel: string | null;
	busy: boolean;
	notice: boolean | null;
	onChoose: (model: string) => void;
	onEdit?: (() => void) | undefined;
	onDuplicate?: (() => void) | undefined;
	onTest: () => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation();
	const { mode, desktop } = useShellChrome();
	const [actionsOpen, setActionsOpen] = useState(false);
	if (provider.scope !== "user") return null;
	const configured = provider.keyConfigured || (provider.origin === "device" && !!provider.endpointId);
	const active = provider.isDefault && chosenModel !== null;
	const Icon = provider.origin === "device" ? Laptop : Cloud;
	const closeActions = () => setActionsOpen(false);
	function runAction(action: () => void) {
		closeActions();
		action();
	}
	return (
		<li
			className={`flex flex-col gap-[var(--spacing-2)] rounded-[var(--radius-card)] border p-[var(--spacing-3)] ${active ? "border-[var(--color-border-strong)] bg-[var(--color-bg-selected)]" : "border-[var(--color-border-subtle)] bg-[var(--color-bg-card)]"}`}
		>
			<div className="flex items-center gap-[var(--spacing-2)]">
				<IconTile>
					<Icon size={17} aria-hidden="true" />
				</IconTile>
				<div className="min-w-0 flex-1">
					<p className="truncate text-body font-medium">{provider.name}</p>
					{provider.note ? (
						<p className="truncate text-caption text-[var(--color-text-secondary)]">{provider.note}</p>
					) : null}
				</div>
				{active ? (
					<span className="shrink-0 text-caption text-[var(--color-text-primary)]">{t("models.inUse")}</span>
				) : null}
				<div className="flex shrink-0 items-center">
					{onEdit ? (
						<IconButton size="sm" aria-label={t("models.editAction")} title={t("models.editAction")} onClick={onEdit}>
							<Pencil size={16} aria-hidden="true" />
						</IconButton>
					) : null}
					<IconButton
						size="sm"
						aria-label={t("models.moreActions")}
						title={t("models.moreActions")}
						aria-haspopup="dialog"
						aria-expanded={actionsOpen}
						onClick={() => setActionsOpen(true)}
					>
						<MoreHorizontal size={16} aria-hidden="true" />
					</IconButton>
				</div>
			</div>
			{provider.models.length > 0 ? (
				<ul className="flex flex-col gap-0">
					{provider.models.map((model) => (
						<ListOption
							key={model}
							name="provider-model"
							value={`${provider.id}:${model}`}
							title={model}
							checked={chosenModel === model}
							disabled={busy || !configured || !provider.enabled}
							onSelect={() => onChoose(model)}
						/>
					))}
				</ul>
			) : (
				<p className="text-caption text-[var(--color-text-tertiary)]">{t("models.noModels")}</p>
			)}
			{!configured || !provider.enabled ? (
				<p className="text-caption text-[var(--color-text-tertiary)]">
					{t(!configured ? "models.notConfigured" : "models.disabled")}
				</p>
			) : null}
			{notice !== null ? (
				<p
					role="status"
					className={notice ? "text-caption text-[var(--color-success)]" : "text-caption text-[var(--color-danger)]"}
				>
					{t(notice ? "models.testPassed" : "models.testFailed")}
				</p>
			) : null}
			<Overlay
				open={actionsOpen}
				onClose={closeActions}
				title={provider.name}
				mode={desktop && mode === "mobile" ? "compact" : mode}
				size="small"
				mobilePresentation="sheet"
				closeLabel={t("app.close")}
			>
				<div className="grid gap-[var(--spacing-2)] p-[var(--spacing-4)]">
					{onDuplicate ? (
						<Button variant="ghost" onClick={() => runAction(onDuplicate)}>
							{t("models.duplicate")}
						</Button>
					) : null}
					<Button variant="ghost" onClick={() => runAction(onTest)}>
						{t("models.test")}
					</Button>
					<Button variant="danger" disabled={provider.isDefault} onClick={() => runAction(onDelete)}>
						{t(provider.isDefault ? "models.cannotDeleteDefault" : "models.delete")}
					</Button>
				</div>
			</Overlay>
		</li>
	);
}
