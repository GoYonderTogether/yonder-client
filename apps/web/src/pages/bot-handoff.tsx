import { Button } from "@yonder/ui-components";
import { ApiError, ownedBots, useContacts, usePerson } from "@yonder/ui-data";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function BotHandoff({
	botId,
	busy,
	onTransfer,
	error,
	goal = false,
}: {
	botId: string;
	busy: boolean;
	onTransfer(botId: string): void;
	error: unknown;
	goal?: boolean;
}) {
	const { t } = useTranslation();
	const owner = usePerson();
	const bots = ownedBots(useContacts().data?.items, owner?.id).filter((bot) => bot.id !== botId);
	const [target, setTarget] = useState("");
	if (!bots.length) return null;
	return (
		<div className="flex flex-col gap-[var(--spacing-2)]">
			<label className="flex flex-col gap-[var(--spacing-2)] text-caption">
				{t("tasks.handoffTo")}
				<select
					value={target}
					onChange={(event) => setTarget(event.target.value)}
					className="rounded-[var(--radius-control)] bg-[var(--color-bg-subtle)] p-[var(--spacing-2)]"
				>
					<option value="">{t("tasks.handoffChoose")}</option>
					{bots.map((bot) => (
						<option key={bot.id} value={bot.id}>
							{bot.displayName}
						</option>
					))}
				</select>
			</label>
			<Button
				variant="secondary"
				size="sm"
				disabled={busy || !bots.some((bot) => bot.id === target)}
				onClick={() => onTransfer(target)}
			>
				{t("tasks.handoffAction")}
			</Button>
			{error ? (
				<p role="alert" className="text-caption text-[var(--color-danger)]">
					{error instanceof ApiError && error.code === "conflict_version"
						? t(goal ? "tasks.goalHandoffConflict" : "tasks.taskHandoffConflict")
						: t("tasks.actionFailed")}
				</p>
			) : null}
		</div>
	);
}
