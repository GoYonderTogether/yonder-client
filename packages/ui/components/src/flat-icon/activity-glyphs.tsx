import type { ReactNode } from "react";
import type { FlatIconProps } from "./flat-icon.tsx";
import { FlatGlyph, nudged } from "./flat-icon.tsx";

const STAR = "M38 4Q39 9 44 10Q39 11 38 16Q37 11 32 10Q37 9 38 4Z";
const CUT = { stroke: "black", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
const WAVE_TOP = "M2 22Q7.5 15 13 22T24 22T35 22T46 22V30Q40.5 37 35 30T24 30T13 30T2 30Z";
const WAVE_LOW = "M2 38Q7.5 31 13 38T24 38T35 38T46 38V44H2Z";

function make(back: ReactNode, front: ReactNode, holes?: ReactNode) {
	return (props: FlatIconProps & { color?: string | undefined }) => (
		<FlatGlyph {...props} back={back} front={front} holes={holes} />
	);
}

const feet = make(<ellipse cx="32" cy="17" rx="7" ry="10" />, <ellipse cx="17" cy="31" rx="7" ry="10" />);

export const SleepGlyph = make(<path d={STAR} />, <path d="M28 5A19 19 0 1 0 43 31A16 16 0 0 1 28 5Z" />);
export const WalkGlyph = feet;
export const RunGlyph = feet;
export const BikeGlyph = make(
	<path d="M12 32L20 14H30L36 32H24Z" />,
	<>
		<circle cx="12" cy="32" r="9" />
		<circle cx="36" cy="32" r="9" />
	</>,
	<>
		<circle cx="12" cy="32" r="4.5" />
		<circle cx="36" cy="32" r="4.5" />
	</>,
);
export const CarGlyph = make(
	<>
		<circle cx="14" cy="38" r="5" />
		<circle cx="34" cy="38" r="5" />
	</>,
	<path d="M6 30A4 4 0 0 1 10 26L14 16A6 6 0 0 1 19 13H29A6 6 0 0 1 34 16L38 26A4 4 0 0 1 42 30V36A3 3 0 0 1 39 39H9A3 3 0 0 1 6 36Z" />,
	<path d="M17 18H31L34 25H14Z" />,
);
export const TrainGlyph = make(
	<rect x="12" y="38" width="24" height="5" rx="2.5" />,
	<rect x="10" y="5" width="28" height="33" rx="9" />,
	<>
		<rect x="15" y="11" width="18" height="11" rx="3" />
		<circle cx="17" cy="30" r="2.5" />
		<circle cx="31" cy="30" r="2.5" />
	</>,
);
export const FlightGlyph = make(
	<ellipse cx="24" cy="44" rx="7" ry="2" />,
	<path d="M24 3C26 3 27.5 5 27.5 8V17L42 26V31L27.5 27V35L32 39V42L24 40L16 42V39L20.5 35V27L6 31V26L20.5 17V8C20.5 5 22 3 24 3Z" />,
);
export const FoodGlyph = make(
	<path d="M31 5C36.5 7 39 13 39 21H35.5V41A2.5 2.5 0 0 1 30.5 41V5Z" />,
	<path d="M9 5H12.5V15H13.5V5H16.5V15H17.5V5H21V16A6 6 0 0 1 17.5 21.4V41A2.5 2.5 0 0 1 12.5 41V21.4A6 6 0 0 1 9 16Z" />,
);
export const CoffeeGlyph = make(
	<>
		<circle cx="36" cy="27" r="6.5" />
		<rect x="14" y="3" width="3.5" height="9" rx="1.75" />
		<rect x="23" y="3" width="3.5" height="9" rx="1.75" />
	</>,
	<path d="M7 18H35V30A12 12 0 0 1 23 42H19A12 12 0 0 1 7 30Z" />,
	<circle cx="36" cy="27" r="2.8" />,
);
export const MusicGlyph = make(
	<>
		<circle cx="32" cy="34" r="6.5" />
		<rect x="35.5" y="9" width="4" height="25" />
	</>,
	<>
		<circle cx="16" cy="36" r="6.5" />
		<rect x="19.5" y="9" width="4" height="27" />
		<path d="M19.5 9L38 5V14L19.5 18Z" />
	</>,
);
export const CalendarGlyph = make(
	<>
		<rect x="14" y="4" width="5" height="10" rx="2.5" />
		<rect x="29" y="4" width="5" height="10" rx="2.5" />
	</>,
	<rect x="6" y="10" width="36" height="32" rx="8" />,
	<>
		<circle cx="15" cy="27" r="2.4" />
		<circle cx="24" cy="27" r="2.4" />
		<circle cx="33" cy="27" r="2.4" />
		<circle cx="15" cy="34" r="2.4" />
		<circle cx="24" cy="34" r="2.4" />
	</>,
);
export const CampGlyph = make(
	<ellipse cx="24" cy="43" rx="16" ry="2.5" />,
	<path d="M24 7Q26 7 27 9L44 38Q45 41 42 41H6Q3 41 4 38L21 9Q22 7 24 7Z" />,
	<path d="M24 25L32 42H16Z" />,
);
export const BookGlyph = make(
	<path d="M26 12C30 8.5 36 8 42 9.5V37C36 35.5 30 36 26 39.5Z" />,
	<path d="M22 12C18 8.5 12 8 6 9.5V37C12 35.5 18 36 22 39.5Z" />,
	<>
		<rect x="10" y="16" width="8" height="2.6" rx="1.3" />
		<rect x="10" y="22" width="8" height="2.6" rx="1.3" />
	</>,
);
export const NatureGlyph = make(
	<rect x="21" y="35" width="6" height="9" rx="2" />,
	<path d="M24 4L38 24H31L40 36H8L17 24H10Z" strokeLinejoin="round" />,
);
export const WaterGlyph = make(<path d={WAVE_LOW} />, <path d={WAVE_TOP} />);

/** A list on a clipboard: the task source and anything that stands for a task. */
const TaskGlyphBase = make(
	<rect x="14" y="6" width="28" height="34" rx="8" />,
	<>
		<rect x="6" y="10" width="30" height="34" rx="8" />
		<rect x="13" y="3" width="16" height="12" rx="5" />
	</>,
	<>
		<rect x="13" y="3" width="16" height="12" rx="5" fill="none" strokeWidth={3} stroke="black" />
		<path d="M12.5 24l2.8 2.8 5-5.6" {...CUT} strokeWidth={2.6} />
		<rect x="24" y="23" width="8" height="3.2" rx="1.6" />
		<circle cx="15.5" cy="35" r="2.6" />
		<rect x="24" y="33.4" width="8" height="3.2" rx="1.6" />
	</>,
);

/** Five bars of a recording; the lighter ones sit behind. */
export const RecordingGlyph = make(
	<>
		<rect x="14" y="10" width="5" height="28" rx="2.5" />
		<rect x="30" y="12" width="5" height="24" rx="2.5" />
	</>,
	<>
		<rect x="4" y="18" width="5" height="12" rx="2.5" />
		<rect x="22" y="4" width="5" height="40" rx="2.5" />
		<rect x="39" y="18" width="5" height="12" rx="2.5" />
	</>,
);

export const ACTIVITY_GLYPHS = {
	sleep: nudged(SleepGlyph, [0.8, -0.8]),
	walk: nudged(WalkGlyph, [1.1, -1.5]),
	run: nudged(RunGlyph, [1.1, -1.5]),
	bike: nudged(BikeGlyph, [0, -4.9]),
	car: nudged(CarGlyph, [0, -4.6]),
	train: TrainGlyph,
	flight: nudged(FlightGlyph, [0, -0.9]),
	food: nudged(FoodGlyph, [2.3, 1.2]),
	coffee: nudged(CoffeeGlyph, [0.9, -1.4]),
	music: nudged(MusicGlyph, [-0.7, 0.1]),
	calendar: CalendarGlyph,
	camp: nudged(CampGlyph, [0, -3.3]),
	book: nudged(BookGlyph, [2, 0.3]),
	nature: NatureGlyph,
	water: nudged(WaterGlyph, [0.2, -6.3]),
} as const;

/** Two people, one in front: the contacts tab and anything that stands for people. */
const ContactsGlyphBase = make(
	<>
		<circle cx="35" cy="17" r="6" />
		<path d="M24 38A11 11 0 0 1 46 38Z" />
	</>,
	<>
		<circle cx="19" cy="15" r="7.5" />
		<path d="M4 41A15 15 0 0 1 34 41Z" />
	</>,
);

export const TaskGlyph = nudged(TaskGlyphBase, [0.8, -1]);
export const ContactsGlyph = nudged(ContactsGlyphBase, [0.6, -2]);
