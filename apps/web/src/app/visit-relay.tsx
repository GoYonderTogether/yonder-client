import { Button } from "@yonder/ui-components";
import { ApiError, useOutwardActions } from "@yonder/ui-data";
import { CornerUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export function VisitRelay({
	conversationId,
	messageId,
	pending,
	disabled,
}: {
	conversationId: string;
	messageId: string | undefined;
	pending: boolean;
	disabled: boolean;
}) {
	const { t } = useTranslation();
	const { ask } = useOutwardActions(conversationId);
	const error = ask.error;
	return (
		<div className="flex flex-wrap items-center gap-[var(--spacing-2)]">
			<Button
				size="sm"
				variant="secondary"
				className="rounded-[var(--radius-full)]"
				disabled={disabled || !messageId || (ask.isSuccess && ask.variables === messageId)}
				loading={ask.isPending}
				onClick={() => {
					if (messageId) ask.mutate(messageId);
				}}
			>
				<CornerUpRight className="icon-scaled" aria-hidden="true" />
				{t("visits.relayAsk")}
			</Button>
			{pending || (ask.data?.state === "open" && ask.variables === messageId) ? (
				<span role="status" className="text-caption text-[var(--color-text-secondary)]">
					{t("visits.relayOpen")}
				</span>
			) : null}
			{error ? (
				<span role="alert" className="text-caption text-[var(--color-danger)]">
					{t(
						error instanceof ApiError
							? error.status === 429
								? "visits.relayRateLimit"
								: error.code === "conflict_version"
									? "visits.relayAlreadyOpen"
									: error.messageKey
							: "app.loadFailed",
					)}
				</span>
			) : null}
		</div>
	);
}
