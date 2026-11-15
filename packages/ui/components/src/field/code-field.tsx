import { useEffect, useId, useRef, useState } from "react";
import { InputFrame } from "./field.tsx";

export interface CodeFieldProps {
	value: string;
	onChange: (value: string) => void;
	onComplete?: (value: string) => void;
	disabled?: boolean;
	invalid?: boolean;
	autoFocus?: boolean;
	label: string;
	describedBy?: string | undefined;
	id?: string;
}

/** Six visual cells, one real input so pasting and OS one-time-code autofill work. */
export function CodeField({
	value,
	onChange,
	onComplete,
	disabled,
	invalid,
	autoFocus,
	label,
	describedBy,
	id,
}: CodeFieldProps) {
	const generated = useId();
	const completed = useRef(false);
	const [focused, setFocused] = useState(false);

	useEffect(() => {
		if (value.length === 6 && !completed.current) {
			completed.current = true;
			onComplete?.(value);
		}
		if (value.length < 6) completed.current = false;
	}, [value, onComplete]);

	return (
		<div className="relative">
			<input
				id={id ?? generated}
				value={value}
				onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				inputMode="numeric"
				autoComplete="one-time-code"
				pattern="[0-9]*"
				disabled={disabled}
				aria-label={label}
				aria-invalid={invalid || undefined}
				aria-describedby={describedBy}
				// biome-ignore lint/a11y/noAutofocus: after sending a code, entering it is the next action.
				autoFocus={autoFocus}
				className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed"
			/>
			<div aria-hidden="true" className="pointer-events-none flex justify-between gap-[var(--spacing-1)]">
				{["d0", "d1", "d2", "d3", "d4", "d5"].map((slot, index) => (
					<InputFrame
						key={slot}
						fieldSize="lg"
						invalid={invalid}
						disabled={disabled}
						focused={focused && index === Math.min(value.length, 5)}
						className="w-[var(--control-md)] shrink-0 justify-center !px-0 text-h3 tabular-nums text-[var(--color-text-primary)]"
					>
						{value[index] ?? ""}
					</InputFrame>
				))}
			</div>
		</div>
	);
}
