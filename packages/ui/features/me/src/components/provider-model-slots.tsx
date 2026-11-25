import { Button, Checkbox, IconButton, SelectField, TextField } from "@yonder/ui-components";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EFFORT_LEVELS, type EffortLevel, type ModelSlot, newSlot } from "./provider-model-slots.ts";

/**
 * The model table: one row per model, each with what a person sees, what the endpoint is sent, the
 * window it declares and the reasoning levels its upstream really accepts.
 *
 * A row exists for every model the provider serves. The levels are per model because the upstreams
 * disagree about them: one endpoint's models may each take a different vocabulary, and sending one
 * a model does not know is a 400. A row with no level ticked is never sent a thinking field, which
 * is the correct default for an endpoint that has not been checked.
 */
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
	/** Model ids the endpoint reported; a row whose id is one of these offers a picker. */
	available: readonly string[];
	disabled: boolean;
	/** The last test result per slot key, when one was run. */
	errorOf: (key: string) => { ok: boolean; message: string } | undefined;
	onChange: (slots: ModelSlot[]) => void;
	onTest: (slot: ModelSlot) => void;
	testing: string | null;
}) {
	const { t } = useTranslation();
	const update = (key: string, patch: Partial<ModelSlot>) =>
		onChange(slots.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)));
	const toggleEffort = (slot: ModelSlot, level: EffortLevel, on: boolean) =>
		update(slot.key, {
			efforts: on
				? EFFORT_LEVELS.filter((each) => each === level || slot.efforts.includes(each))
				: slot.efforts.filter((each) => each !== level),
		});
	const known = (slot: ModelSlot) => available.includes(slot.id.trim());
	return (
		<div className="flex flex-col gap-[var(--spacing-3)]">
			{slots.map((slot, index) => {
				const result = errorOf(slot.key);
				return (
					<div
						key={slot.key}
						className="flex flex-col gap-[var(--spacing-2)] rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] p-[var(--spacing-3)]"
					>
						<div className="flex items-start gap-[var(--spacing-2)]">
							<span className="mt-[var(--spacing-2)] text-caption text-[var(--color-text-tertiary)] tabular-nums">
								{index + 1}
							</span>
							<div className="grid min-w-0 flex-1 gap-[var(--spacing-2)] sm:grid-cols-2">
								<TextField
									label={t("models.slotName")}
									value={slot.name}
									onChange={(event) => update(slot.key, { name: event.target.value })}
									placeholder={t("models.slotNameHint")}
									disabled={disabled}
								/>
								{known(slot) || !available.length ? (
									<TextField
										label={t("models.slotModelId")}
										value={slot.id}
										onChange={(event) => update(slot.key, { id: event.target.value })}
										placeholder={t("models.slotModelIdHint")}
										disabled={disabled}
										required
										requiredMark
									/>
								) : (
									<SelectField
										label={t("models.slotModelId")}
										value={slot.id}
										onChange={(value) => update(slot.key, { id: value })}
										options={[
											{ value: "", label: t("models.slotModelIdHint") },
											...available.map((id) => ({ value: id, label: id })),
										]}
										disabled={disabled}
									/>
								)}
							</div>
							<IconButton
								size="sm"
								aria-label={t("models.removeSlot")}
								title={t("models.removeSlot")}
								disabled={disabled || slots.length === 1}
								onClick={() => onChange(slots.filter((each) => each.key !== slot.key))}
							>
								<Trash2 size={16} aria-hidden="true" />
							</IconButton>
						</div>
						<div className="grid gap-[var(--spacing-2)] sm:grid-cols-2">
							<TextField
								label={t("models.slotContext")}
								type="number"
								inputMode="numeric"
								value={slot.contextLength}
								onChange={(event) => update(slot.key, { contextLength: event.target.value })}
								placeholder={t("models.slotContextHint")}
								disabled={disabled}
							/>
							<div className="flex flex-col gap-[var(--spacing-1)]">
								<span className="text-caption text-[var(--color-text-secondary)]">{t("models.slotEfforts")}</span>
								<div className="flex flex-wrap gap-[var(--spacing-3)]">
									{EFFORT_LEVELS.map((level) => (
										<Checkbox
											key={level}
											checked={slot.efforts.includes(level)}
											disabled={disabled}
											onChange={(event) => toggleEffort(slot, level, event.target.checked)}
										>
											{t(`models.effort.${level}`)}
										</Checkbox>
									))}
								</div>
								<span className="text-caption text-[var(--color-text-tertiary)]">{t("models.slotEffortsHint")}</span>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-[var(--spacing-2)]">
							<Button
								type="button"
								size="sm"
								variant="ghost"
								loading={testing === slot.key}
								disabled={disabled || testing !== null || !slot.id.trim()}
								onClick={() => onTest(slot)}
							>
								{t("models.testSlot")}
							</Button>
							{result ? (
								<span
									role="status"
									className={`text-caption ${result.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}
								>
									{result.ok ? t("models.testPassed") : result.message || t("models.testFailed")}
								</span>
							) : null}
						</div>
					</div>
				);
			})}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={disabled}
				onClick={() => onChange([...slots, newSlot()])}
			>
				<Plus size={16} aria-hidden="true" />
				{t("models.addSlot")}
			</Button>
		</div>
	);
}
