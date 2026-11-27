import { Button, IconButton, SelectField, TextField } from "@yonder/ui-components";
import { ChevronDown, Download, ListChecks, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EffortField } from "./provider-model-effort-field.tsx";
import { type ModelSlot, newSlot } from "./provider-model-slots.ts";

type SlotResult = { ok: boolean; message: string } | undefined;

/** 262144 → 256K, 1000000 → 1M: powers of two in 1024s, others in 1000s, three significant digits. */
function shortTokens(value: string): string {
	const tokens = Number(value.replace(/,/g, ""));
	if (!Number.isSafeInteger(tokens) || tokens < 1) return "";
	const base = tokens % 1024 === 0 ? 1024 : 1000;
	if (tokens >= base * base) return `${Number((tokens / (base * base)).toPrecision(3))}M`;
	if (tokens >= base) return `${Number((tokens / base).toPrecision(3))}K`;
	return String(tokens);
}

/**
 * One row per upstream model. The row reads `id · 256K · 推理`; the context window, the output limit
 * and the reasoning levels are editable, folded into 「高级」 the way CC Switch keeps per-model
 * declarations out of the way until someone needs them.
 */
function ModelSlotRow({
	slot,
	index,
	available,
	disabled,
	removable,
	busy,
	loading,
	result,
	onChange,
	onRemove,
	onTest,
}: {
	slot: ModelSlot;
	index: number;
	available: readonly string[];
	disabled: boolean;
	removable: boolean;
	busy: boolean;
	loading: boolean;
	result: SlotResult;
	onChange: (patch: Partial<ModelSlot>) => void;
	onRemove: () => void;
	onTest: () => void;
}) {
	const { t } = useTranslation();
	const summary = [shortTokens(slot.contextLength), slot.efforts.length ? t("models.picker.reasoning") : ""]
		.filter(Boolean)
		.join(" · ");
	const advanced = Boolean(slot.contextLength || slot.maxOutput || slot.efforts.length);
	return (
		<div className="flex min-w-0 flex-col gap-[var(--spacing-2)] rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] p-[var(--spacing-3)]">
			<div className="flex items-center gap-[var(--spacing-2)]">
				<span className="w-4 shrink-0 text-caption text-[var(--color-text-tertiary)] tabular-nums">{index + 1}</span>
				<div className="flex min-w-0 flex-1 flex-col gap-[var(--spacing-2)] @md:flex-row">
					{available.includes(slot.id.trim()) || !available.length ? (
						<TextField
							label={t("models.slotModelId")}
							placeholder={t("models.slotModelIdHint")}
							value={slot.id}
							onChange={(event) => onChange({ id: event.target.value })}
							disabled={disabled}
							required
							requiredMark
						/>
					) : (
						<SelectField
							label={t("models.slotModelId")}
							value={slot.id}
							onChange={(id) => onChange({ id })}
							options={[
								{ value: "", label: t("models.slotModelIdHint") },
								...available.map((id) => ({ value: id, label: id })),
							]}
							disabled={disabled}
						/>
					)}
					{summary ? (
						<span className="shrink-0 self-center text-caption tabular-nums text-[var(--color-text-tertiary)]">
							{summary}
						</span>
					) : null}
				</div>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					loading={loading}
					disabled={disabled || busy || !slot.id.trim()}
					onClick={onTest}
				>
					{t("models.testSlot")}
				</Button>
				<IconButton
					size="sm"
					aria-label={t("models.removeSlot")}
					title={t("models.removeSlot")}
					disabled={disabled || !removable}
					onClick={onRemove}
				>
					<Trash2 size={16} aria-hidden="true" />
				</IconButton>
			</div>
			<details open={advanced} className="group flex flex-col gap-[var(--spacing-2)]">
				<summary className="flex cursor-pointer list-none items-center gap-[var(--spacing-1)] text-caption text-[var(--color-text-secondary)] [&::-webkit-details-marker]:hidden">
					<ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180" />
					{t("models.advanced")}
				</summary>
				<div className="mt-[var(--spacing-2)] grid min-w-0 gap-[var(--spacing-2)] @md:grid-cols-3">
					<TextField
						label={t("models.slotName")}
						value={slot.name}
						onChange={(event) => onChange({ name: event.target.value })}
						placeholder={t("models.slotNameHint")}
						disabled={disabled}
					/>
					<TextField
						label={t("models.slotContext")}
						inputMode="text"
						value={slot.contextLength}
						onChange={(event) => onChange({ contextLength: event.target.value })}
						placeholder={t("models.slotContextHint")}
						disabled={disabled}
					/>
					<TextField
						label={t("models.slotMaxOutput")}
						inputMode="text"
						value={slot.maxOutput}
						onChange={(event) => onChange({ maxOutput: event.target.value })}
						placeholder={t("models.slotMaxOutputHint")}
						disabled={disabled}
					/>
				</div>
				<EffortField selected={slot.efforts} disabled={disabled} onChange={(efforts) => onChange({ efforts })} />
			</details>
			{result ? (
				<span
					role="status"
					className={`min-w-0 break-words text-caption ${result.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}
				>
					{result.ok ? t("models.testPassed") : result.message || t("models.testFailed")}
				</span>
			) : null}
		</div>
	);
}

/**
 * One row per upstream model; an empty effort selection never sends a thinking field. The header
 * button follows CC Switch: a download icon fetches the list when there is none, and once there is
 * one it becomes 「选择模型」 and opens the picker.
 */
export function ProviderModelSlots({
	slots,
	available,
	disabled,
	errorOf,
	onChange,
	onTest,
	testing,
	onFetch,
	onOpenPicker,
	fetching,
	canFetch,
}: {
	slots: readonly ModelSlot[];
	available: readonly string[];
	disabled: boolean;
	errorOf: (key: string) => SlotResult;
	onChange: (slots: ModelSlot[]) => void;
	onTest: (slot: ModelSlot) => void;
	testing: string | null;
	onFetch: () => void;
	onOpenPicker: () => void;
	fetching: boolean;
	canFetch: boolean;
}) {
	const { t } = useTranslation();
	const hasModels = available.length > 0;
	return (
		<div className="flex min-w-0 flex-col gap-[var(--spacing-2)]">
			<div className="flex items-center justify-between gap-[var(--spacing-2)]">
				<span className="text-caption text-[var(--color-text-secondary)]">{t("models.modelsTitle")}</span>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					loading={fetching}
					disabled={disabled || !canFetch}
					onClick={hasModels ? onOpenPicker : onFetch}
				>
					{hasModels ? <ListChecks size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
					{hasModels ? t("models.picker.title") : t("models.fetchModels")}
				</Button>
			</div>
			{slots.map((slot, index) => (
				<ModelSlotRow
					key={slot.key}
					slot={slot}
					index={index}
					available={available}
					disabled={disabled}
					removable={slots.length > 1}
					busy={testing !== null}
					loading={testing === slot.key}
					result={errorOf(slot.key)}
					onChange={(patch) => onChange(slots.map((each) => (each.key === slot.key ? { ...each, ...patch } : each)))}
					onRemove={() => onChange(slots.filter((each) => each.key !== slot.key))}
					onTest={() => onTest(slot)}
				/>
			))}
			<Button
				type="button"
				size="sm"
				variant="ghost"
				disabled={disabled}
				onClick={() => onChange([...slots, newSlot()])}
			>
				<Plus size={16} aria-hidden="true" />
				{t("models.addSlot")}
			</Button>
		</div>
	);
}
