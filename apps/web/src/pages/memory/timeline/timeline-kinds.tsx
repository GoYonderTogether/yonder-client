/** Preview only: the kind of thing a step is, drawn here so each kind reads at a glance. Strokes use currentColor; CSS sets the colour from the registered tokens. Brand marks (WeChat and the like) are never drawn here: they use the official icon. */

export type Kind = "thought" | "task" | "decision" | "recording" | "doc" | "place";

export function KindIcon({ kind, size = 16 }: { kind: Kind; size?: number }) {
	return (
		<svg
			className={`tl-kind tl-kind-${kind}`}
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
		>
			{kind === "thought" ? (
				<>
					<path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V15h-.5A2.5 2.5 0 0 1 5 12.5z" />
					<path d="M9 8.5h6M9 11.5h3.5" />
				</>
			) : null}
			{kind === "task" ? (
				<>
					<circle cx="12" cy="12" r="8" />
					<path d="M8.5 12.2l2.4 2.4 4.6-5" />
				</>
			) : null}
			{kind === "decision" ? (
				<>
					<path d="M6 5v7a3 3 0 0 0 3 3h9" />
					<path d="M14.5 11.5L18 15l-3.5 3.5" />
				</>
			) : null}
			{kind === "recording" ? <path d="M4 12h2M8 8v8M12 5v14M16 8v8M20 12h-2" /> : null}
			{kind === "doc" ? (
				<>
					<path d="M7 4h6.5L18 8.5V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
					<path d="M13.5 4v4.5H18M9 13h6M9 16h4" />
				</>
			) : null}
			{kind === "place" ? (
				<>
					<path d="M12 20s6-5.2 6-10a6 6 0 0 0-12 0c0 4.8 6 10 6 10z" />
					<circle cx="12" cy="10" r="2.2" />
				</>
			) : null}
		</svg>
	);
}
