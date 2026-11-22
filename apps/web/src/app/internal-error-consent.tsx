import { ListGroup, ListSwitch } from "@yonder/ui-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { internalErrorConsent, internalErrorPilot, setInternalErrorConsent } from "../lib/internal-errors.ts";

export function InternalErrorConsent() {
	const { t } = useTranslation();
	const [enabled, setEnabled] = useState(internalErrorConsent);
	const [error, setError] = useState(false);
	if (!internalErrorPilot()) return null;
	return (
		<ListGroup>
			<ListSwitch
				title={t("me.general.internalErrorTitle")}
				subtitle={t("me.general.internalErrorDescription")}
				checked={enabled}
				onChange={(next) => {
					setError(!setInternalErrorConsent(next));
					setEnabled(internalErrorConsent());
				}}
				error={error ? t("me.general.closeBehaviorError") : undefined}
			/>
		</ListGroup>
	);
}
