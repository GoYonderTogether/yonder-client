import { ListGroup, ListOption } from "@yonder/ui-components";
import { defaultChoiceId, useProviderActions, useProviders } from "@yonder/ui-data";
import { useTranslation } from "react-i18next";

/**
 * 「官方模型」: the platform's own models, and the one the account falls back to when no provider of
 * its own is chosen. It never lists a provider: a provider's own models are chosen in its own block
 * below, so the two never compete for the same single choice.
 */
export function DefaultModelSection() {
	const { t } = useTranslation();
	const providers = useProviders();
	const actions = useProviderActions();
	const choices = (providers.data?.platformModels ?? []).filter((model) => model.enabled);
	if (choices.length === 0) return null;
	const current = defaultChoiceId(providers.data);
	const saved = actions.setDefault.isSuccess && !actions.setDefault.isPending;
	return (
		<ListGroup
			title={t("models.officialTitle")}
			footer={
				actions.setDefault.isError ? (
					<span role="alert" className="text-[var(--color-danger)]">
						{t("models.saveFailed")}
					</span>
				) : saved ? (
					<span role="status">{t("models.saved")}</span>
				) : (
					t("models.officialHint")
				)
			}
		>
			{choices.map((model) => (
				<ListOption
					key={model.id}
					name="default-model"
					value={model.id}
					title={model.name}
					checked={current === model.id}
					disabled={actions.setDefault.isPending}
					onSelect={() => actions.setDefault.mutate(model.id)}
				/>
			))}
		</ListGroup>
	);
}
