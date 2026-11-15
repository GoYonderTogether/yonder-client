import { Checkbox } from "@yonder/ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function ProviderModelPicker({
	available,
	selected,
	hasMetadata,
	onChange,
}: {
	available: string[];
	selected: string[];
	hasMetadata: boolean;
	onChange: (ids: string[]) => void;
}) {
	const { t } = useTranslation();
	const [selectedOnly, setSelectedOnly] = useState(false);
	return (
		<div className="flex flex-col gap-[var(--spacing-2)]">
			{hasMetadata ? (
				<p className="text-caption text-[var(--color-text-secondary)]">{t("models.metadataSource")}</p>
			) : null}
			<div className="flex flex-wrap gap-[var(--spacing-4)]">
				<Checkbox
					checked={available.every((id) => selected.includes(id))}
					onChange={(event) =>
						onChange(
							event.target.checked
								? [...new Set([...selected, ...available])]
								: selected.filter((id) => !available.includes(id)),
						)
					}
				>
					{t("models.selectAll")}
				</Checkbox>
				<Checkbox checked={selectedOnly} onChange={(event) => setSelectedOnly(event.target.checked)}>
					{t("models.selectedOnly")}
				</Checkbox>
			</div>
			{available
				.filter((id) => !selectedOnly || selected.includes(id))
				.map((id) => (
					<Checkbox
						key={id}
						checked={selected.includes(id)}
						onChange={(event) =>
							onChange(event.target.checked ? [...selected, id] : selected.filter((value) => value !== id))
						}
					>
						{id}
					</Checkbox>
				))}
		</div>
	);
}
