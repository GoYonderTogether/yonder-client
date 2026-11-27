import type { ProviderModelMetadata } from "@yonder/protocol";
import { Button, Checkbox, SearchInput } from "@yonder/ui-components";
import { Overlay } from "@yonder/ui-shell";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModelSlot } from "./provider-model-slots.ts";
import { completeSlots, discoveredSlot, newSlot } from "./provider-model-slots.ts";

/**
 * The model picker, laid out the way CC Switch does it: a search field, select-all and select-none,
 * a selected count and "only selected", then one row per model with a checkbox, the id, and a
 * read-only summary (`256K · 推理 · 图片`). Models the endpoint returned come first; a model the
 * person added by hand that the endpoint does not list sits in its own group.
 */
export function ModelPickerDialog({
	open,
	onClose,
	available,
	metadata,
	slots,
	onApply,
}: {
	open: boolean;
	onClose: () => void;
	/** Model ids the endpoint returned. */
	available: readonly string[];
	/** What the endpoint declared about each model. */
	metadata: Record<string, ProviderModelMetadata>;
	slots: readonly ModelSlot[];
	onApply: (slots: ModelSlot[]) => void;
}) {
	const { t } = useTranslation();
	const chosen = new Set(slots.map((slot) => slot.id.trim()).filter(Boolean));
	const extra = [...chosen].filter((id) => !available.includes(id));
	const allIds = [...extra, ...available];
	const [draft, setDraft] = useState<Set<string>>(() => new Set(chosen));
	const [query, setQuery] = useState("");
	const [onlySelected, setOnlySelected] = useState(false);
	const byId = useMemo(() => new Map(slots.map((slot) => [slot.id.trim(), slot])), [slots]);
	const matches = (id: string) =>
		(!onlySelected || draft.has(id)) && (!query.trim() || id.toLowerCase().includes(query.trim().toLowerCase()));
	const visible = allIds.filter(matches);
	const visibleExtra = extra.filter(matches);
	const visibleFetched = available.filter(matches);
	const selectedCount = allIds.filter((id) => draft.has(id)).length;

	const toggle = (id: string, on: boolean) =>
		setDraft((current) => {
			const next = new Set(current);
			if (on) next.add(id);
			else next.delete(id);
			return next;
		});
	const setAll = (ids: readonly string[], on: boolean) =>
		setDraft((current) => {
			const next = new Set(current);
			for (const id of ids) {
				if (on) next.add(id);
				else next.delete(id);
			}
			return next;
		});
	const apply = () => {
		// A kept row keeps what the person declared; a newly picked one starts from what the endpoint said.
		const next = allIds.filter((id) => draft.has(id)).map((id) => byId.get(id) ?? discoveredSlot(id, metadata[id]));
		onApply(completeSlots(next));
		onClose();
	};

	return (
		<Overlay
			open={open}
			onClose={onClose}
			title={t("models.picker.title")}
			mode="wide"
			closeLabel={t("app.close")}
			mobileBackLabel={t("app.back")}
			mobilePresentation="tall-sheet"
			footer={
				<>
					<Button type="button" onClick={onClose}>
						{t("app.cancel")}
					</Button>
					<Button type="button" variant="primary" onClick={apply}>
						{t("models.picker.apply")}
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-[var(--spacing-3)] p-[var(--spacing-5)]">
				<div className="flex items-center gap-[var(--spacing-2)]">
					<SearchInput
						className="min-w-0 flex-1"
						placeholder={t("models.picker.search")}
						aria-label={t("models.picker.search")}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={!visible.length}
						onClick={() => setAll(visible, true)}
					>
						{t("models.picker.selectAll")}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={!visible.length}
						onClick={() => setAll(visible, false)}
					>
						{t("models.picker.selectNone")}
					</Button>
				</div>
				<div className="flex items-center justify-between gap-[var(--spacing-3)] text-caption text-[var(--color-text-secondary)]">
					<span role="status">
						{t("models.picker.selectedCount", { selected: selectedCount, total: allIds.length })}
					</span>
					<Checkbox checked={onlySelected} onChange={(event) => setOnlySelected(event.target.checked)}>
						{t("models.picker.onlySelected")}
					</Checkbox>
				</div>
				<div className="max-h-[45vh] min-h-0 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--color-border-subtle)]">
					{visible.length === 0 ? (
						<p className="p-[var(--spacing-5)] text-center text-body text-[var(--color-text-secondary)]">
							{t("models.picker.empty")}
						</p>
					) : (
						<ul className="flex flex-col">
							{visibleExtra.length ? (
								<li className="bg-[var(--color-bg-subtle)] px-[var(--spacing-4)] py-[var(--spacing-1)] text-caption text-[var(--color-text-secondary)]">
									{t("models.picker.notInProvider")}
								</li>
							) : null}
							{visibleExtra.map((id) => (
								<PickerRow
									key={id}
									id={id}
									checked={draft.has(id)}
									summary={summaryOf(id, metadata[id], t)}
									onChange={(on) => toggle(id, on)}
								/>
							))}
							{visibleFetched.map((id) => (
								<PickerRow
									key={id}
									id={id}
									checked={draft.has(id)}
									summary={summaryOf(id, metadata[id], t)}
									onChange={(on) => toggle(id, on)}
								/>
							))}
						</ul>
					)}
				</div>
			</div>
		</Overlay>
	);
}

function PickerRow({
	id,
	checked,
	summary,
	onChange,
}: {
	id: string;
	checked: boolean;
	summary: string;
	onChange: (on: boolean) => void;
}) {
	return (
		<li className="border-t border-[var(--color-border-subtle)] first:border-t-0">
			<div className="flex items-center gap-[var(--spacing-2)] px-[var(--spacing-4)] py-[var(--spacing-2)]">
				<Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={id} />
				<span className="min-w-0 flex-1 truncate text-body text-[var(--color-text-primary)]" title={id}>
					{id}
				</span>
				{summary ? (
					<span className="shrink-0 text-caption tabular-nums text-[var(--color-text-tertiary)]">{summary}</span>
				) : null}
			</div>
		</li>
	);
}

/** `256K · 推理 · 图片`, the same read-only summary CC Switch shows per row. */
function summaryOf(id: string, declared: ProviderModelMetadata | undefined, t: (key: string) => string): string {
	const parts: string[] = [];
	if (declared?.contextLength) parts.push(formatTokens(declared.contextLength));
	if (declared?.efforts?.length) parts.push(t("models.picker.reasoning"));
	return parts.join(" · ");
}

/** 262144 → 256K, 1000000 → 1M: powers of two in 1024s, others in 1000s, three significant digits. */
function formatTokens(tokens: number): string {
	const base = tokens % 1024 === 0 ? 1024 : 1000;
	if (tokens >= base * base) return `${Number((tokens / (base * base)).toPrecision(3))}M`;
	if (tokens >= base) return `${Number((tokens / base).toPrecision(3))}K`;
	return String(tokens);
}
