import { Avatar, Button, Checkbox, EmptyState, IconButton, Segmented } from "@yonder/ui-components";
import { CircleDashed, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { interactionStates, type PreviewState, Section, StateRow, sizes } from "./preview-parts.tsx";

const buttonVariants = ["primary", "secondary", "ghost", "danger", "link"] as const;
const iconVariants = ["ghost", "secondary"] as const;
const buttonStates: readonly PreviewState[] = [...interactionStates, "loading"];
const avatarSizes = [16, 24, 28, 32, 36, 40, 48, 64, 80] as const;

function SegmentedExample({ disabled }: { disabled: boolean }) {
	const { t } = useTranslation();
	const [value, setValue] = useState("one");
	return (
		<Segmented
			aria-label={t("dev.components.segmented")}
			disabled={disabled}
			value={value}
			onChange={setValue}
			options={[
				{ value: "one", label: t("dev.sample.optionOne") },
				{ value: "two", label: t("dev.sample.optionTwo") },
			]}
		/>
	);
}

export function ButtonPreviews() {
	const { t } = useTranslation();
	return (
		<>
			<Section name={t("dev.components.button")}>
				{buttonVariants.flatMap((variant) =>
					sizes.map((size) => (
						<StateRow
							key={`${variant}-${size}`}
							label={t("dev.row", { variant: t(`dev.variants.${variant}`), size: t(`dev.sizes.${size}`) })}
							supported={buttonStates}
							render={(state) => (
								<Button
									data-preview-button={variant}
									variant={variant}
									size={size}
									disabled={state === "disabled"}
									loading={state === "loading"}
								>
									{t("dev.sample.button")}
								</Button>
							)}
						/>
					)),
				)}
			</Section>

			<Section name={t("dev.components.iconButton")}>
				{iconVariants.flatMap((variant) =>
					(["sm", "md"] as const).map((size) => (
						<StateRow
							key={`${variant}-${size}`}
							label={t("dev.row", { variant: t(`dev.variants.${variant}`), size: t(`dev.sizes.${size}`) })}
							supported={interactionStates}
							render={(state) => (
								<IconButton
									data-preview-button={variant}
									variant={variant}
									size={size}
									aria-label={t("dev.sample.icon")}
									disabled={state === "disabled"}
								>
									<Plus size={16} aria-hidden="true" />
								</IconButton>
							)}
						/>
					)),
				)}
			</Section>

			<Section name={t("dev.components.checkbox")}>
				{(["unchecked", "checked"] as const).map((variant) => (
					<StateRow
						key={variant}
						label={t("dev.row", { variant: t(`dev.variants.${variant}`), size: t("dev.sizes.fixed") })}
						supported={interactionStates}
						render={(state) => (
							<Checkbox data-preview-checkbox defaultChecked={variant === "checked"} disabled={state === "disabled"}>
								{t("dev.sample.label")}
							</Checkbox>
						)}
					/>
				))}
			</Section>

			<Section name={t("dev.components.segmented")}>
				<StateRow
					label={t("dev.sizes.sm")}
					supported={interactionStates}
					render={(state) => <SegmentedExample disabled={state === "disabled"} />}
				/>
			</Section>

			<Section name={t("dev.components.avatar")}>
				{(["person", "bot"] as const).map((kind) => (
					<div key={kind} className="flex flex-col gap-[var(--spacing-2)]">
						<h3 className="text-caption text-[var(--color-text-secondary)]">{t(`dev.variants.${kind}`)}</h3>
						<div className="flex flex-wrap items-end gap-[var(--spacing-4)]">
							{avatarSizes.map((size) => (
								<div key={size} className="flex flex-col items-center gap-[var(--spacing-1)]">
									<Avatar name={t("dev.sample.label")} kind={kind} size={size} />
									<span className="text-micro text-[var(--color-text-secondary)]">
										{t("dev.value", { value: size })}
									</span>
								</div>
							))}
						</div>
					</div>
				))}
			</Section>

			<Section name={t("dev.components.emptyState")}>
				<EmptyState icon={<CircleDashed />} title={t("dev.sample.label")} />
				<EmptyState
					icon={<CircleDashed />}
					title={t("dev.sample.label")}
					action={<Button>{t("dev.sample.button")}</Button>}
				/>
			</Section>
		</>
	);
}
