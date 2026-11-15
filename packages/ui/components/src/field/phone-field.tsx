import type { InputHTMLAttributes } from "react";
import { useId } from "react";
import { type FieldSize, INPUT_CLASS, InputFrame } from "./field.tsx";
import { Listbox } from "./listbox.tsx";

export interface PhoneFieldProps extends InputHTMLAttributes<HTMLInputElement> {
	countryCode: string;
	onCountryCodeChange: (code: string) => void;
	countries: readonly { code: string; label: string }[];
	countryLabel: string;
	fieldSize?: FieldSize;
	invalid?: boolean;
}

export function PhoneField({
	countryCode,
	onCountryCodeChange,
	countries,
	countryLabel,
	fieldSize,
	invalid,
	disabled,
	id,
	className,
	...rest
}: PhoneFieldProps) {
	const generated = useId();
	const inputId = id ?? generated;
	return (
		<InputFrame fieldSize={fieldSize} invalid={invalid} disabled={disabled} className={className}>
			<Listbox
				label={countryLabel}
				value={countryCode}
				onChange={onCountryCodeChange}
				options={countries.map((country) => ({ value: country.code, label: country.label }))}
				disabled={disabled}
				className="h-full"
			>
				{countryCode}
			</Listbox>
			<span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--color-border-default)]" />
			<input
				id={inputId}
				type="tel"
				inputMode="tel"
				autoComplete="tel-national"
				aria-invalid={invalid || undefined}
				aria-describedby={invalid ? `${inputId}-hint` : undefined}
				disabled={disabled}
				className={INPUT_CLASS}
				{...rest}
			/>
		</InputFrame>
	);
}
