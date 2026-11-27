/** Preview only: the part-of-day marks, drawn here instead of taken from an icon set. Strokes and fills use currentColor, so the chip and the card's watermark take their colour from CSS. */

export type Sky = "dawn" | "day" | "dusk" | "night";

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

/** A 24-unit mark for the chip: sun, rising sun, setting sun, moon. */
export function SkyIcon({ sky, size = 14 }: { sky: Sky; size?: number }) {
	return (
		<svg
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
			{sky === "day" ? (
				<>
					<circle cx="12" cy="12" r="4" />
					{RAYS.map((deg) => (
						<line key={deg} x1="12" y1="2.5" x2="12" y2="5" transform={`rotate(${deg} 12 12)`} />
					))}
				</>
			) : null}
			{sky === "dawn" ? (
				<>
					<path d="M6 17a6 6 0 0 1 12 0" />
					<path d="M3 17h18" />
					<path d="M12 7v2.5" />
					<path d="M5.6 10.6l1.8 1.8" />
					<path d="M18.4 10.6l-1.8 1.8" />
					<path d="M9.5 5L12 2.5 14.5 5" />
				</>
			) : null}
			{sky === "dusk" ? (
				<>
					<path d="M6 15a6 6 0 0 1 12 0" />
					<path d="M3 15h18" />
					<path d="M7 19h10" />
					<path d="M12 5v2.5" />
					<path d="M9.5 5.5L12 8l2.5-2.5" />
				</>
			) : null}
			{sky === "night" ? (
				<>
					<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
					<path d="M17 3v3M15.5 4.5h3" />
				</>
			) : null}
		</svg>
	);
}

/** The watermark behind a whole card: a big, plain shape for the sky, kept faint by CSS so it never fights the text. */
export function SkyMark({ sky }: { sky: Sky }) {
	return (
		<svg className="tl-mark" viewBox="0 0 160 100" fill="currentColor" aria-hidden>
			{sky === "day" ? (
				<>
					<circle cx="112" cy="42" r="24" />
					<circle cx="112" cy="42" r="40" fillOpacity="0.35" />
					<circle cx="112" cy="42" r="58" fillOpacity="0.15" />
				</>
			) : null}
			{sky === "night" ? (
				<>
					<path d="M126 14a34 34 0 1 0 22 56 28 28 0 0 1-22-56z" />
					<circle cx="84" cy="24" r="2" />
					<circle cx="70" cy="52" r="1.5" />
					<circle cx="98" cy="62" r="1.5" />
					<circle cx="56" cy="30" r="1.5" />
				</>
			) : null}
			{sky === "dawn" || sky === "dusk" ? (
				<>
					<path d="M90 70a22 22 0 0 1 44 0z" />
					<path d="M76 70a36 36 0 0 1 72 0z" fillOpacity="0.3" />
					<path d="M60 70a52 52 0 0 1 104 0z" fillOpacity="0.12" />
					<path d="M0 100V78q30-8 60-3t60-2 40 3v24z" fillOpacity="0.5" />
				</>
			) : null}
		</svg>
	);
}
