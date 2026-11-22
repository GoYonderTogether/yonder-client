import type { ReactNode } from "react";
import { useId } from "react";
import { Field, type FieldSize, InputFrame } from "./field.tsx";
import { Listbox, type ListboxOption } from "./listbox.tsx";

export interface SelectFieldProps {
	id?: string;
	label: string;
	requiredMark?: boolean | undefined;
	value: string;
	options: readonly ListboxOption[];
	onChange: (value: string) => void;
	hint?: ReactNode;
	error?: ReactNode;
	disabled?: boolean;
	fieldSize?: FieldSize;
}

export function SelectField({
	id,
	label,
	requiredMark,
	value,
	options,
	onChange,
	hint,
	error,
	disabled,
	fieldSize,
}: SelectFieldProps) {
	const generated = useId();
	const fieldId = id ?? generated;
	return (
		<Field label={label} hint={hint} error={error} htmlFor={fieldId} requiredMark={requiredMark}>
			<InputFrame fieldSize={fieldSize} invalid={Boolean(error)} disabled={disabled}>
				<Listbox
					id={fieldId}
					label={label}
					value={value}
					options={options}
					onChange={onChange}
					disabled={disabled}
					invalid={Boolean(error)}
					describedBy={hint || error ? `${fieldId}-hint` : undefined}
					className="h-full flex-1"
					triggerClassName="w-full"
				/>
			</InputFrame>
		</Field>
	);
}
