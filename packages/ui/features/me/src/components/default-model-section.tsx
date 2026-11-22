import { ListGroup, ListOption } from "@yonder/ui-components";
import { defaultChoiceId, modelChoices, useProviderActions, useProviders } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";

/**
 * 「主模型」: the model every Bot of the account answers with unless a Bot names its own. Picking a
 * row saves at once; a platform model and a provider of the person's own are one list because the
 * question is the same (docs/settings-forms.md, 「pick one of several」).
 */
export function DefaultModelSection() {
	const { t } = useTranslation();
	const providers = useProviders();
	const actions = useProviderActions();
	const choices = modelChoices(providers.data);
	if (choices.length === 0) return null;
	const current = defaultChoiceId(providers.data);
	const saved = actions.setDefault.isSuccess && !actions.setDefault.isPending;
	return (
		<ListGroup
			title={t("models.defaultTitle")}
			footer={
				actions.setDefault.isError ? (
					<span role="alert" className="text-[var(--color-danger)]">
						{t("models.saveFailed")}
					</span>
				) : saved ? (
					<span role="status">{t("models.saved")}</span>
				) : (
					t("models.defaultHint")
				)
			}
		>
			{choices.map((choice) => (
				<ListOption
					key={choice.id}
					name="default-model"
					value={choice.id}
					title={choice.name}
					subtitle={choice.deviceName ? t("models.viaDevice", { device: choice.deviceName }) : undefined}
					checked={current === choice.id}
					disabled={!choice.usable || actions.setDefault.isPending}
					onSelect={() => actions.setDefault.mutate(choice.id)}
				/>
			))}
		</ListGroup>
	);
}
