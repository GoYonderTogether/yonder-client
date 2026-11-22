import type { Member } from "@yonder/protocol";
import { ListGroup, ListOption } from "@yonder/ui-components";
import { modelChoices, useProviders, useUpdateBot } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";

/**
 * Which model one Bot answers with. 「跟随主模型」 is the first choice and the default: clearing a
 * Bot's own choice is how it returns to the account's main model. Picking a row saves at once.
 */
export function BotModelPage({ bot }: { bot: Member }) {
	const { t } = useTranslation();
	const providers = useProviders();
	const update = useUpdateBot();
	const choices = modelChoices(providers.data);
	const chosen = bot.modelChoice ?? null;
	// A choice the Bot names that is no longer listed (deleted, disabled) reads as following the default,
	// because that is what the server does with it.
	const effective = chosen && choices.some((choice) => choice.id === chosen && choice.usable) ? chosen : null;
	const pick = (choice: string | null) => update.mutate({ id: bot.id, modelChoice: choice });
	return (
		<ListGroup
			footer={
				update.isError ? (
					<span role="alert" className="text-[var(--color-danger)]">
						{t("models.saveFailed")}
					</span>
				) : update.isSuccess && !update.isPending ? (
					<span role="status">{t("models.saved")}</span>
				) : undefined
			}
		>
			<ListOption
				name={`bot-model-${bot.id}`}
				value=""
				title={t("models.followDefault")}
				checked={effective === null}
				disabled={update.isPending}
				onSelect={() => pick(null)}
			/>
			{choices.map((choice) => (
				<ListOption
					key={choice.id}
					name={`bot-model-${bot.id}`}
					value={choice.id}
					title={choice.name}
					subtitle={choice.deviceName ? t("models.viaDevice", { device: choice.deviceName }) : undefined}
					checked={effective === choice.id}
					disabled={!choice.usable || update.isPending}
					onSelect={() => pick(choice.id)}
				/>
			))}
		</ListGroup>
	);
}
