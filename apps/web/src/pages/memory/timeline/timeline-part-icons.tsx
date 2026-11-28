import type { ReactNode } from "react";
import type { Sky } from "./timeline-sky.tsx";
import type { DayPart } from "./timeline-types.ts";

/**
 * The eight parts of the day drawn flat and in colour, one small scene each, on a 24-unit grid. Fills and
 * strokes come from classes in timeline-part-icons.css, so every colour is a token and follows the theme;
 * the motion lives there too and only plays while the mark is on screen.
 */
const SPARK = "M0 -2.4L.7 -.7 2.4 0 .7 .7 0 2.4-.7 .7-2.4 0-.7-.7z";
const MOON = "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z";
const CRESCENT = "M16 4A8.5 8.5 0 1 0 20 16.5 7 7 0 0 1 16 4z";
const CLOUD = "M6.5 18a3 3 0 0 1 .3-6 4.5 4.5 0 0 1 8.7-1A3.5 3.5 0 0 1 16 18z";
const HILLS_FAR = "M0 19Q5 14.5 10 17.5T24 16V24H0z";
const HILLS_NEAR = "M0 21Q6 17.5 12 20T24 19V24H0z";
const ALL = [0, 45, 90, 135, 180, 225, 270, 315];
const UP = [-72, -36, 0, 36, 72];

function Moon({ x, y, s }: { x: number; y: number; s: number }) {
	return (
		<g transform={`translate(${x - 11 * s} ${y - 12 * s}) scale(${s})`}>
			<path className="pi-moon" d={MOON} />
		</g>
	);
}

function Spark({ x, y, s = 1, d = 0 }: { x: number; y: number; s?: number; d?: number }) {
	return (
		<g transform={`translate(${x} ${y}) scale(${s})`}>
			<path className="pi-star pi-twinkle" d={SPARK} style={{ animationDelay: `${d}s` }} />
		</g>
	);
}

function Rays({
	cx,
	cy,
	from,
	to,
	angles,
	motion,
}: {
	cx: number;
	cy: number;
	from: number;
	to: number;
	angles: number[];
	motion: "pi-spin" | "pi-pulse";
}) {
	return (
		<g className={motion}>
			{angles.map((deg) => (
				<line
					key={deg}
					className="pi-ray"
					x1={cx}
					y1={cy - from}
					x2={cx}
					y2={cy - to}
					transform={`rotate(${deg} ${cx} ${cy})`}
				/>
			))}
		</g>
	);
}

const ART: Record<DayPart, ReactNode> = {
	// Before dawn: a thin moon and a few stars still out.
	predawn: (
		<>
			<path className="pi-moon" d={CRESCENT} />
			<path className="pi-horizon" d="M0 21Q6 18 12 19.5T24 18.5V24H0z" />
			<Spark x={17} y={7} s={1.1} />
			<Spark x={19} y={14} s={0.8} d={0.9} />
			<Spark x={7} y={19} s={0.7} d={1.7} />
		</>
	),
	// Dawn: the sun climbs out from behind two hills, its rays breathing.
	dawn: (
		<>
			<g className="pi-rise">
				<circle className="pi-glow" cx={12} cy={16} r={8.5} />
				<circle className="pi-sunrise" cx={12} cy={16} r={5} />
				<Rays cx={12} cy={16} from={7.4} to={9.6} angles={UP} motion="pi-pulse" />
			</g>
			<path className="pi-hill-far" d={HILLS_FAR} />
			<path className="pi-hill-near" d={HILLS_NEAR} />
		</>
	),
	// Morning: a young sun, a slow ring of rays, one small cloud drifting under it.
	morning: (
		<>
			<circle className="pi-glow" cx={9} cy={9} r={7.5} />
			<Rays cx={9} cy={9} from={6.2} to={8.2} angles={ALL} motion="pi-spin" />
			<circle className="pi-sun" cx={9} cy={9} r={4.2} />
			<path className="pi-bird pi-flap" d="M15 6q1.2-1.6 2.4 0q1.2-1.6 2.4 0" />
			<path className="pi-bird pi-flap" style={{ animationDelay: "0.7s" }} d="M17 10q.9-1.2 1.8 0q.9-1.2 1.8 0" />
			<g className="pi-drift">
				<g transform="translate(5 3.5)">
					<path className="pi-cloud" d={CLOUD} />
				</g>
			</g>
		</>
	),
	// Noon: the sun straight overhead, rays turning.
	noon: (
		<>
			<circle className="pi-glow" cx={12} cy={12} r={10} />
			<Rays cx={12} cy={12} from={7.4} to={10} angles={ALL} motion="pi-spin" />
			<circle className="pi-sun" cx={12} cy={12} r={5} />
		</>
	),
	// Afternoon: a warm gold sun, a cloud sliding across the corner of it.
	afternoon: (
		<>
			<circle className="pi-glow pi-glow-warm" cx={9} cy={10} r={8} />
			<Rays cx={9} cy={10} from={6.6} to={8.6} angles={ALL} motion="pi-pulse" />
			<circle className="pi-sun-warm" cx={9} cy={10} r={4.6} />
			<g className="pi-drift">
				<g transform="translate(6 3)">
					<path className="pi-cloud" d={CLOUD} />
				</g>
			</g>
		</>
	),
	// Dusk: a low orange sun sinking behind two violet hills, the first star above.
	dusk: (
		<>
			<g className="pi-sink">
				<circle className="pi-glow pi-glow-warm" cx={12} cy={17} r={8.5} />
				<circle className="pi-sun-warm" cx={12} cy={17} r={5.5} />
			</g>
			<path className="pi-hill-far" d={HILLS_FAR} />
			<path className="pi-hill-near" d={HILLS_NEAR} />
			<Spark x={18.5} y={6} s={0.8} />
		</>
	),
	// Evening: a moon over dark hills, stars coming on one after another.
	evening: (
		<>
			<Moon x={14} y={9.5} s={0.85} />
			<Spark x={6} y={8} s={0.9} d={0.3} />
			<Spark x={10} y={4.5} s={0.6} d={1.2} />
			<Spark x={19} y={16} s={0.7} d={2} />
			<path className="pi-hill-near" d={HILLS_NEAR} />
		</>
	),
	// Late night: a full moon with a slow glow, stars twinkling out of step.
	night: (
		<>
			<circle className="pi-glow pi-glow-moon" cx={12} cy={12} r={9} />
			<circle className="pi-moon" cx={12} cy={12} r={6.8} />
			<circle className="pi-crater" cx={10} cy={10.5} r={1.6} />
			<circle className="pi-crater" cx={14.2} cy={13.4} r={1.2} />
			<circle className="pi-crater" cx={10.8} cy={14.8} r={0.9} />
			<Spark x={5} y={6} />
			<Spark x={19} y={6} s={0.8} d={0.8} />
			<Spark x={18} y={19} d={1.6} />
			<Spark x={5} y={18} s={0.7} d={2.2} />
		</>
	),
};

/** A part the owner wrote as words ("从上午到下午") is drawn as the part its sky belongs to. */
export const partOfSky: Record<Sky, DayPart> = { dawn: "dawn", day: "noon", dusk: "dusk", night: "night" };

export function PartIcon({ part, size = 22 }: { part: DayPart; size?: number }) {
	return (
		<svg className="pi" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
			{ART[part]}
		</svg>
	);
}
