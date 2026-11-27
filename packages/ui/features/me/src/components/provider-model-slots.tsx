import { Button, IconButton, SelectField, TextField } from "@yonder/ui-components";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EffortField } from "./provider-model-effort-field.tsx";
import { type ModelSlot, newSlot } from "./provider-model-slots.ts";

type SlotResult = { ok: boolean; message: string } | undefined;

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
	return (
		<div className="@container flex min-w-0 flex-col gap-[var(--spacing-2)] rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] p-[var(--spacing-3)]">
			<div className="flex items-center justify-between gap-[var(--spacing-2)]">
				<span className="text-caption text-[var(--color-text-tertiary)] tabular-nums">{index + 1}</span>
				<div className="flex items-center gap-[var(--spacing-1)]">
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
			</div>
			<div className="grid min-w-0 gap-[var(--spacing-2)] @md:grid-cols-2">
				<TextField
					label={t("models.slotName")}
					value={slot.name}
					onChange={(event) => onChange({ name: event.target.value })}
					placeholder={t("models.slotNameHint")}
					disabled={disabled}
				/>
				{available.includes(slot.id.trim()) || !available.length ? (
					<TextField
						label={t("models.slotModelId")}
						value={slot.id}
						onChange={(event) => onChange({ id: event.target.value })}
						placeholder={t("models.slotModelIdHint")}
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
			</div>
			<div className="grid min-w-0 gap-[var(--spacing-2)] @md:grid-cols-3">
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
				<EffortField selected={slot.efforts} disabled={disabled} onChange={(efforts) => onChange({ efforts })} />
			</div>
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

/** One row per upstream model; an empty effort selection never sends a thinking field. */
export function ProviderModelSlots({
	slots,
	available,
	disabled,
	errorOf,
	onChange,
	onTest,
	testing,
}: {
	slots: readonly ModelSlot[];
	available: readonly string[];
	disabled: boolean;
	errorOf: (key: string) => SlotResult;
	onChange: (slots: ModelSlot[]) => void;
	onTest: (slot: ModelSlot) => void;
	testing: string | null;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex min-w-0 flex-col gap-[var(--spacing-2)]">
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
