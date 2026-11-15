import {
	CodeField,
	Field,
	type FieldSize,
	InputFrame,
	Listbox,
	PasswordField,
	PhoneField,
	SelectField,
	TextField,
} from "@yonder/ui-components";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { fieldStates, interactionStates, type PreviewState, Section, StateRow, sizes } from "./preview-parts.tsx";

function FrameExample({ state, size }: { state: PreviewState; size: FieldSize }) {
	const { t } = useTranslation();
	return (
		<div data-preview-input>
			<InputFrame fieldSize={size} invalid={state === "error"} disabled={state === "disabled"}>
				<input
					aria-label={t("dev.sample.label")}
					aria-invalid={state === "error" || undefined}
					disabled={state === "disabled"}
					placeholder={t("dev.sample.label")}
					className="min-w-0 w-full bg-transparent text-body text-[var(--color-text-primary)] outline-none focus-visible:outline-none focus-visible:shadow-none"
				/>
			</InputFrame>
		</div>
	);
}

function PhoneExample({ state, size }: { state: PreviewState; size: FieldSize }) {
	const { t } = useTranslation();
	const id = useId();
	const [country, setCountry] = useState("+86");
	const error = state === "error" ? t("dev.sample.error") : undefined;
	return (
		<div data-preview-input>
			<Field htmlFor={id} label={t("dev.sample.label")} error={error}>
				<PhoneField
					id={id}
					fieldSize={size}
					countryCode={country}
					onCountryCodeChange={setCountry}
					countryLabel={t("dev.sample.country")}
					countries={[
						{ code: "+86", label: `${t("auth.countries.+86")} +86` },
						{ code: "+1", label: `${t("auth.countries.+1")} +1` },
					]}
					placeholder={t("dev.sample.phone")}
					disabled={state === "disabled"}
					invalid={Boolean(error)}
				/>
			</Field>
		</div>
	);
}

function PasswordExample({ state, size }: { state: PreviewState; size: FieldSize }) {
	const { t } = useTranslation();
	const id = useId();
	const error = state === "error" ? t("dev.sample.error") : undefined;
	return (
		<div data-preview-input>
			<Field htmlFor={id} label={t("dev.sample.label")} error={error}>
				<PasswordField
					id={id}
					fieldSize={size}
					placeholder={t("dev.sample.label")}
					showLabel={t("auth.showPassword")}
					hideLabel={t("auth.hidePassword")}
					disabled={state === "disabled"}
					invalid={Boolean(error)}
				/>
			</Field>
		</div>
	);
}

function CodeExample({ state }: { state: PreviewState }) {
	const { t } = useTranslation();
	const id = useId();
	const [value, setValue] = useState("123");
	const error = state === "error" ? t("dev.sample.error") : undefined;
	return (
		<div data-preview-code>
			<Field htmlFor={id} label={t("dev.sample.label")} error={error}>
				<CodeField
					id={id}
					label={t("dev.sample.label")}
					value={value}
					onChange={setValue}
					disabled={state === "disabled"}
					invalid={Boolean(error)}
					describedBy={error ? `${id}-hint` : undefined}
				/>
			</Field>
		</div>
	);
}

function SelectExample({ state, size }: { state: PreviewState; size: FieldSize }) {
	const { t } = useTranslation();
	const [value, setValue] = useState("one");
	return (
		<div data-preview-input data-preview-picker>
			<SelectField
				fieldSize={size}
				label={t("dev.sample.label")}
				value={value}
				onChange={setValue}
				disabled={state === "disabled"}
				error={state === "error" ? t("dev.sample.error") : undefined}
				options={[
					{ value: "one", label: t("dev.sample.optionOne") },
					{ value: "two", label: t("dev.sample.optionTwo") },
				]}
			/>
		</div>
	);
}

function ListboxExample({ state }: { state: PreviewState }) {
	const { t } = useTranslation();
	const [value, setValue] = useState("one");
	return (
		<div data-preview-input data-preview-picker>
			<InputFrame disabled={state === "disabled"} invalid={state === "error"}>
				<Listbox
					label={t("dev.sample.open")}
					value={value}
					onChange={setValue}
					disabled={state === "disabled"}
					invalid={state === "error"}
					options={[
						{ value: "one", label: t("dev.sample.optionOne") },
						{ value: "two", label: t("dev.sample.optionTwo") },
					]}
				/>
			</InputFrame>
		</div>
	);
}

export function FieldPreviews() {
	const { t } = useTranslation();
	return (
		<>
			<Section name={t("dev.components.inputFrame")}>
				{sizes.map((size) => (
					<StateRow
						key={size}
						label={t(`dev.sizes.${size}`)}
						supported={fieldStates}
						render={(state) => <FrameExample state={state} size={size} />}
					/>
				))}
			</Section>
			<Section name={t("dev.components.textField")}>
				{sizes.map((size) => (
					<StateRow
						key={size}
						label={t(`dev.sizes.${size}`)}
						supported={fieldStates}
						render={(state) => (
							<div data-preview-input>
								<TextField
									fieldSize={size}
									label={t("dev.sample.label")}
									placeholder={t("dev.sample.label")}
									disabled={state === "disabled"}
									error={state === "error" ? t("dev.sample.error") : undefined}
								/>
							</div>
						)}
					/>
				))}
			</Section>
			<Section name={t("dev.components.phoneField")}>
				{sizes.map((size) => (
					<StateRow
						key={size}
						label={t(`dev.sizes.${size}`)}
						supported={fieldStates}
						render={(state) => <PhoneExample state={state} size={size} />}
					/>
				))}
			</Section>
			<Section name={t("dev.components.passwordField")}>
				{sizes.map((size) => (
					<StateRow
						key={size}
						label={t(`dev.sizes.${size}`)}
						supported={fieldStates}
						render={(state) => <PasswordExample state={state} size={size} />}
					/>
				))}
			</Section>
			<Section name={t("dev.components.codeField")}>
				<StateRow
					label={t("dev.sizes.fixed")}
					minWidth="17rem"
					supported={fieldStates}
					render={(state) => <CodeExample state={state} />}
				/>
			</Section>
			<Section name={t("dev.components.selectField")}>
				{sizes.map((size) => (
					<StateRow
						key={size}
						label={t(`dev.sizes.${size}`)}
						supported={fieldStates}
						render={(state) => <SelectExample state={state} size={size} />}
					/>
				))}
			</Section>
			<Section name={t("dev.components.listbox")}>
				<StateRow
					label={t("dev.sizes.md")}
					supported={[...interactionStates, "error"]}
					render={(state) => <ListboxExample state={state} />}
				/>
			</Section>
		</>
	);
}
