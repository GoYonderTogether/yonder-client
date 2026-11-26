import { Button, IconButton, Listbox, TextInput } from "@yonder/ui-components";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EffortSelect } from "./provider-effort-select.tsx";
import { type EffortLevel, type ModelSlot, newSlot } from "./provider-model-slots.ts";

/**
 * The model table: one row per model, each with what a person sees, what the endpoint is sent, the
 * window it declares and the reasoning levels its upstream really accepts.
 *
 * A row puts its two names on the first line and its two settings on the second. Five columns side
 * by side would fit a desktop window, but this form is also a phone-width drawer, and a five-column
 * grid there truncates every value — a model id cut to `claude-opu` is worse than a second line.
 *
 * The levels are per model because the upstreams disagree about them: one endpoint's models may
 * each take a different vocabulary, and sending one a model does not know is a 400. A row with no
 * level ticked is never sent a thinking field, which is the correct default for an endpoint that
 * has not been checked.
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
	const known = (slot: ModelSlot) => available.includes(slot.id.trim());
	return (
		<div className="flex flex-col gap-[var(--spacing-2)]">
			<div className="flex flex-col gap-[var(--spacing-2)]">
				{slots.map((slot, index) => {
					const result = errorOf(slot.key);
					return (
						<div
							key={slot.key}
							className="flex flex-col gap-[var(--spacing-2)] rounded-[var(--radius-card)] border border-[var(--color-border-subtle)] p-[var(--spacing-3)]"
						>
							<div className="flex items-center gap-[var(--spacing-2)]">
								<span className="w-4 shrink-0 text-caption text-[var(--color-text-tertiary)] tabular-nums">
									{index + 1}
								</span>
								<div className="grid min-w-0 flex-1 gap-[var(--spacing-2)] sm:grid-cols-2">
									<div className="flex min-w-0 flex-col gap-[var(--spacing-1)]">
										<span className="text-caption text-[var(--color-text-tertiary)]">{t("models.slotName")}</span>
										<TextInput
											aria-label={t("models.slotName")}
											value={slot.name}
											onChange={(event) => update(slot.key, { name: event.target.value })}
											placeholder={t("models.slotNameHint")}
											disabled={disabled}
										/>
									</div>
									<div className="flex min-w-0 flex-col gap-[var(--spacing-1)]">
										<span className="text-caption text-[var(--color-text-tertiary)]">{t("models.slotModelId")}</span>
										{known(slot) || !available.length ? (
											<TextInput
												aria-label={t("models.slotModelId")}
												value={slot.id}
												onChange={(event) => update(slot.key, { id: event.target.value })}
												placeholder={t("models.slotModelIdHint")}
												disabled={disabled}
											/>
										) : (
											<Listbox
												label={t("models.slotModelId")}
												value={slot.id}
												onChange={(value) => update(slot.key, { id: value })}
												options={[
													{ value: "", label: t("models.slotModelIdHint") },
													...available.map((id) => ({ value: id, label: id })),
												]}
												disabled={disabled}
												triggerClassName="w-full bg-[var(--color-bg-input)] px-[var(--spacing-3)]"
											/>
										)}
									</div>
								</div>
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
							<div className="grid gap-[var(--spacing-2)] sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
								<div className="flex min-w-0 flex-col gap-[var(--spacing-1)]">
									<span className="text-caption text-[var(--color-text-tertiary)]">{t("models.slotContext")}</span>
									<TextInput
										aria-label={t("models.slotContext")}
										type="number"
										inputMode="numeric"
										className="tabular-nums"
										value={slot.contextLength}
										onChange={(event) => update(slot.key, { contextLength: event.target.value })}
										placeholder={t("models.slotContextHint")}
										disabled={disabled}
									/>
								</div>
								<EffortSelect
									value={slot.efforts}
									disabled={disabled}
									onChange={(levels: EffortLevel[]) => update(slot.key, { efforts: levels })}
								/>
							</div>
							{result ? (
								<p
									role="status"
									className={`text-caption ${result.ok ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}
								>
									{result.ok ? t("models.testPassed") : result.message || t("models.testFailed")}
								</p>
							) : null}
						</div>
					);
				})}
			</div>
			<div className="flex flex-wrap items-center justify-between gap-[var(--spacing-2)]">
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
				<span className="text-caption text-[var(--color-text-tertiary)]">{t("models.slotEffortsHint")}</span>
			</div>
		</div>
	);
}
