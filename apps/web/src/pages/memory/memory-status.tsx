import { Button } from "@yonder/ui-components";
import { useTranslation } from "react-i18next";
import "./memory-files.css";

export function MemoryError({ error, retry, title }: { error: Error; retry?: () => void; title?: string }) {
	const { t } = useTranslation();
	return (
		<div role="alert" className="memory-error">
			{title ? <p>{title}</p> : null}
			<p className="wrap-anywhere">{error.message}</p>
			{retry ? (
				<Button size="sm" variant="secondary" onClick={retry}>
					{t("app.retry")}
				</Button>
			) : null}
		</div>
	);
}
