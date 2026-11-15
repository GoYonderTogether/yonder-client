import { Search } from "lucide-react";
import { TextInput, type TextInputProps } from "./field.tsx";

export interface SearchInputProps extends Omit<TextInputProps, "type" | "leading"> {
	placeholder: string;
}

export function SearchInput({ placeholder, "aria-label": label = placeholder, ...props }: SearchInputProps) {
	return (
		<TextInput
			{...props}
			type="search"
			placeholder={placeholder}
			aria-label={label}
			leading={<Search size={16} aria-hidden="true" className="shrink-0 text-[var(--color-text-tertiary)]" />}
		/>
	);
}
