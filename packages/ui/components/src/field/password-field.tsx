import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { TextInput, type TextInputProps } from "./field.tsx";

export interface PasswordFieldProps extends Omit<TextInputProps, "type" | "trailing"> {
	showLabel: string;
	hideLabel: string;
}

export function PasswordField({ showLabel, hideLabel, disabled, ...props }: PasswordFieldProps) {
	const [visible, setVisible] = useState(false);
	return (
		<TextInput
			{...props}
			disabled={disabled}
			type={visible ? "text" : "password"}
			trailing={
				<button
					type="button"
					aria-label={visible ? hideLabel : showLabel}
					disabled={disabled}
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => setVisible(!visible)}
					className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control-sm)] text-[var(--color-text-secondary)] transition-[background-color,color,scale] duration-[var(--duration-fast)] ease-[var(--ease-standard)] after:absolute after:-inset-1.5 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed"
				>
					{visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
				</button>
			}
		/>
	);
}
