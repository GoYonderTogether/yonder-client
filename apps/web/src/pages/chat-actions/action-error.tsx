import { ApiError } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";

export function ActionError({ error }: { error: unknown }) {
	const { t } = useTranslation();
	if (!error) return null;
	return (
		<p role="alert" className="text-caption text-[var(--color-danger)]">
			{error instanceof ApiError ? t(`errors.${error.code}`) : t("chatActions.failed")}
		</p>
	);
}
