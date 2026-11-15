import { Button } from "@yonder/ui-components";
import { PageFrame } from "@yonder/ui-shell";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

export function NotFoundPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	return (
		<PageFrame title={null}>
			<div className="flex flex-1 flex-col items-center justify-center gap-[var(--spacing-3)] text-center">
				<h1 className="text-h2 text-[var(--color-text-primary)]">{t("notFound.title")}</h1>
				<Button type="button" variant="primary" onClick={() => navigate("/messages")}>
					{t("notFound.goHome")}
				</Button>
			</div>
		</PageFrame>
	);
}
