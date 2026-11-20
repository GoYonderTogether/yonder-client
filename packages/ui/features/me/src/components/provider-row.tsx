import type { Provider } from "@yonder/protocol";
import { Button, IconButton, IconTile } from "@yonder/ui-components";
import { Overlay, useShellChrome } from "@yonder/ui-shell";
import { Boxes, Check, MoreHorizontal, Pencil } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function ProviderRow({
	provider,
	notice,
	onEdit,
	onDefault,
	onDuplicate,
	onTest,
	onDelete,
}: {
	provider: Provider;
	notice: boolean | null;
	onEdit: () => void;
	onDefault: () => void;
	onDuplicate: () => void;
	onTest: () => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation();
	const { mode, desktop } = useShellChrome();
	const [actionsOpen, setActionsOpen] = useState(false);
	if (provider.scope !== "user") return null;
	const active = provider.isDefault && provider.enabled && provider.keyConfigured;
	const closeActions = () => setActionsOpen(false);
	function runAction(action: () => void) {
		closeActions();
		action();
	}
	return (
		<li
			className={`flex flex-wrap items-center gap-[var(--spacing-2)] rounded-[var(--radius-card)] border p-[var(--spacing-3)] ${active ? "border-[var(--color-border-strong)] bg-[var(--color-bg-selected)]" : "border-[var(--color-border-subtle)] bg-[var(--color-bg-card)]"}`}
		>
			<IconTile>
				<Boxes size={17} aria-hidden="true" />
			</IconTile>
			<div className="min-w-0 flex-1">
				<p className="truncate text-body font-medium">
					{provider.name}
					{active ? (
						<span className="ms-[var(--spacing-2)] text-caption text-[var(--color-text-primary)]">
							{t("models.inUse")}
						</span>
					) : null}
				</p>
				<p className="truncate text-caption text-[var(--color-text-secondary)]">
					{provider.note || provider.website || provider.baseUrl}
				</p>
				{provider.models.length > 0 ? (
					<p className="break-words text-caption text-[var(--color-text-secondary)]">
						{t("models.availableModels", { models: provider.models.join(", ") })}
					</p>
				) : null}
				{!provider.keyConfigured || !provider.enabled ? (
					<p className="text-caption text-[var(--color-text-tertiary)]">
						{t(!provider.keyConfigured ? "models.notConfigured" : "models.disabled")}
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
			</div>
			<div className="flex items-center">
				{!provider.isDefault ? (
					<IconButton size="sm" aria-label={t("models.setDefault")} title={t("models.setDefault")} onClick={onDefault}>
						<Check size={16} aria-hidden="true" />
					</IconButton>
				) : null}
				<IconButton size="sm" aria-label={t("models.editAction")} title={t("models.editAction")} onClick={onEdit}>
					<Pencil size={16} aria-hidden="true" />
				</IconButton>
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
					<Button variant="ghost" onClick={() => runAction(onDuplicate)}>
						{t("models.duplicate")}
					</Button>
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
