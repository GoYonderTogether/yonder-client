import type { Provider } from "@yonder/protocol";
import { Button, IconButton, IconTile } from "@yonder/ui-components";
import { Boxes, Check, MoreHorizontal, Pencil } from "lucide-react";
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
	if (provider.scope !== "user") return null;
	const active = provider.isDefault && provider.enabled && provider.keyConfigured;
	return (
		<li
			className={`flex flex-wrap items-center gap-[var(--spacing-2)] rounded-[var(--radius-card)] border p-[var(--spacing-3)] ${active ? "border-[var(--color-border-strong)] bg-[var(--color-bg-selected)]" : "border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]"}`}
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
			{provider.scope === "user" ? (
				<div className="flex items-center">
					{!provider.isDefault ? (
						<IconButton
							size="sm"
							aria-label={t("models.setDefault")}
							title={t("models.setDefault")}
							onClick={onDefault}
						>
							<Check size={16} aria-hidden="true" />
						</IconButton>
					) : null}
					<IconButton size="sm" aria-label={t("models.editAction")} title={t("models.editAction")} onClick={onEdit}>
						<Pencil size={16} aria-hidden="true" />
					</IconButton>
					<details className="relative">
						<summary
							aria-label={t("models.moreActions")}
							title={t("models.moreActions")}
							className="flex size-[var(--control-sm)] cursor-pointer list-none items-center justify-center rounded-[var(--radius-control-sm)] hover:bg-[var(--color-bg-hover)]"
						>
							<MoreHorizontal size={16} aria-hidden="true" />
						</summary>
						<div className="absolute end-0 z-10 flex min-w-max flex-col rounded-[var(--radius-control)] bg-[var(--color-bg-surface)] p-[var(--spacing-2)] shadow-[var(--shadow-lg)]">
							<Button size="sm" variant="ghost" onClick={onDuplicate}>
								{t("models.duplicate")}
							</Button>
							<Button size="sm" variant="ghost" onClick={onTest}>
								{t("models.test")}
							</Button>
							<Button
								size="sm"
								variant="danger"
								onClick={onDelete}
								disabled={provider.isDefault}
								title={provider.isDefault ? t("models.cannotDeleteDefault") : undefined}
							>
								{t(provider.isDefault ? "models.cannotDeleteDefault" : "models.delete")}
							</Button>
						</div>
					</details>
				</div>
			) : null}
		</li>
	);
}
