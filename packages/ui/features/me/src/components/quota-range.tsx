import { Segmented } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";

export type QuotaRange = "cycle" | "7d";

/** This quota month or the last seven days; one switch, above the chart it filters. */
export function RangeSwitch({ range, onRange }: { range: QuotaRange; onRange: (range: QuotaRange) => void }) {
	const { t } = useTranslation();
	return (
		<Segmented
			aria-label={t("me.quota.rangeLabel")}
			value={range}
			onChange={(value) => onRange(value === "7d" ? "7d" : "cycle")}
			options={[
				{ value: "cycle", label: t("me.quota.rangeCycle") },
				{ value: "7d", label: t("me.quota.range7d") },
			]}
		/>
	);
}
