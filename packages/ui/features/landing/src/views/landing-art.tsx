/**
 * Line vignettes for the five chores, drawn in the app's ink. Every stroke has `pathLength="1"`
 * so CSS can draw it in with one dash value; without motion they are simply drawn.
 */
const STROKE = {
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.6,
	strokeLinecap: "round",
	strokeLinejoin: "round",
	pathLength: 1,
} as const;

function Poster() {
	return (
		<>
			<rect x="18" y="14" width="66" height="72" rx="8" {...STROKE} />
			<path d="M18 30h66M34 8v12M68 8v12" {...STROKE} />
			<path d="M30 44h4M44 44h4M58 44h4M72 44h4M30 58h4M44 58h4M72 58h4M30 72h4M44 72h4" {...STROKE} />
			<circle cx="60" cy="58" r="7" {...STROKE} className="lp-art-key" />
			<path d="M100 74c14-2 16-22 30-24s14 14 26 10" {...STROKE} strokeDasharray="0.02 0.03" className="lp-art-dots" />
			<path d="M150 38c0 8-8 14-8 14s-8-6-8-14a8 8 0 0 1 16 0z" {...STROKE} className="lp-art-key" />
			<circle cx="142" cy="38" r="2.5" {...STROKE} />
		</>
	);
}

function Recording() {
	const bars = [10, 22, 34, 18, 40, 26, 14, 30, 20, 8];
	return (
		<>
			{bars.map((h, i) => (
				<path key={h} d={`M${20 + i * 8} ${50 - h / 2}v${h}`} {...STROKE} />
			))}
			<path d="M104 50h10M110 44l6 6-6 6" {...STROKE} className="lp-art-key" />
			<rect x="126" y="18" width="40" height="64" rx="6" {...STROKE} />
			<path d="M134 32h24M134 42h18M134 52h22" {...STROKE} />
			<path d="M134 66l3 3 6-6M148 66h10" {...STROKE} className="lp-art-key" />
		</>
	);
}

function Refund() {
	return (
		<>
			<path d="M26 14h52v68l-6.5-5-6.5 5-6.5-5-6.5 5-6.5-5-6.5 5-6.5-5-6.5 5z" {...STROKE} />
			<path d="M36 30h32M36 42h22M36 54h28" {...STROKE} />
			<path d="M52 66h14" {...STROKE} className="lp-art-key" />
			<circle cx="136" cy="50" r="20" {...STROKE} />
			<path d="M128 42l8 8 8-8M136 50v14M128 54h16" {...STROKE} />
			<path d="M88 30c18-10 28-4 30 6M114 30l4 6 6-4" {...STROKE} className="lp-art-key" />
		</>
	);
}

function Subtitle() {
	return (
		<>
			<rect x="18" y="14" width="140" height="72" rx="8" {...STROKE} />
			<path d="M78 34v20l16-10z" {...STROKE} />
			<path d="M50 66h76M64 76h48" {...STROKE} className="lp-art-key" />
			<path d="M18 26h140" {...STROKE} strokeDasharray="0.015 0.025" className="lp-art-dots" />
		</>
	);
}

function Brief() {
	return (
		<>
			<path d="M18 46h48M26 46a16 16 0 0 1 32 0" {...STROKE} />
			<path d="M42 18v6M24 26l4 4M60 26l-4 4" {...STROKE} className="lp-art-key" />
			<rect x="82" y="14" width="76" height="72" rx="8" {...STROKE} />
			<path d="M94 32l3 3 6-6M110 32h36M94 50l3 3 6-6M110 50h28" {...STROKE} />
			<rect x="93" y="64" width="9" height="9" rx="2" {...STROKE} />
			<path d="M110 68h20" {...STROKE} className="lp-art-key" />
		</>
	);
}

const ART = { poster: Poster, recording: Recording, refund: Refund, subtitle: Subtitle, brief: Brief } as const;

export type ChoreArt = keyof typeof ART;

export function ChoreVignette({ name }: { name: ChoreArt }) {
	const Art = ART[name];
	return (
		<svg className="lp-art" viewBox="0 0 176 100" aria-hidden="true">
			<Art />
		</svg>
	);
}
