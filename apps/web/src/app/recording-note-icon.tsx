import type { LucideProps } from "lucide-react";

export function RecordingNoteIcon({ size = 20, className, ...props }: LucideProps) {
	return (
		<svg
			{...props}
			aria-hidden="true"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="var(--color-accent)"
			strokeWidth={1.4}
			strokeLinecap="round"
			className={className}
		>
			<path d="M4 10v4 M7.2 6.5v11 M10.4 2.5v19 M13.6 7.5v9 M16.8 4.5v15 M20 9v6" />
		</svg>
	);
}
