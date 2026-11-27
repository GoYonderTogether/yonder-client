import type { ReactNode } from "react";
import { useId } from "react";

export interface FlatIconProps {
	size?: number;
	className?: string | undefined;
	/** Moves the drawing so its visual centre sits on the middle of the 48 x 48 canvas. */
	nudge?: readonly [number, number] | undefined;
	"aria-hidden"?: boolean | "true" | "false" | undefined;
}

/**
 * The base of every flat icon: a 48 × 48 canvas with a back layer (the same colour at 40%), a front
 * layer, and details cut out with a mask. Cut-outs are never painted in a background colour, so the
 * glyph stays right on translucent chrome, tiles and dark mode. Colour is `currentColor` unless the
 * caller passes `color`.
 */
export function FlatGlyph({
	size = 24,
	className,
	nudge = [0, 0],
	color,
	back,
	front,
	holes,
}: FlatIconProps & { color?: string | undefined; back?: ReactNode; front: ReactNode; holes?: ReactNode }) {
	const mask = useId().replace(/[^a-zA-Z0-9_-]/g, "");
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 48 48"
			aria-hidden="true"
			className={className}
			style={color ? { color } : undefined}
		>
			<g transform={`translate(${nudge[0]} ${nudge[1]})`}>
				<mask id={mask} maskUnits="userSpaceOnUse" x="-8" y="-8" width="64" height="64">
					<rect x="-8" y="-8" width="64" height="64" fill="white" />
					<g fill="black" stroke="none">
						{holes}
					</g>
				</mask>
				<g mask={`url(#${mask})`} fill="currentColor">
					<g opacity={0.4}>{back}</g>
					{front}
				</g>
			</g>
		</svg>
	);
}

export type GlyphComponent = (props: FlatIconProps & { color?: string | undefined }) => ReactNode;

/** The same glyph, moved so its visual centre sits on the middle of the canvas. */
export function nudged(Glyph: GlyphComponent, nudge: readonly [number, number]): GlyphComponent {
	return (props) => <Glyph {...props} nudge={nudge} />;
}

const STAR_BIG = "M24 5Q26.5 19.5 41 24Q26.5 28.5 24 43Q21.5 28.5 7 24Q21.5 19.5 24 5Z";
const STAR_SMALL = "M38 4Q39 9 44 10Q39 11 38 16Q37 11 32 10Q37 9 38 4Z";

export function PlaceGlyph(props: FlatIconProps) {
	return (
		<FlatGlyph
			{...props}
			back={<ellipse cx="24" cy="43" rx="12" ry="3" />}
			front={<path d="M24 41C24 41 10 30 10 19A14 14 0 0 1 38 19C38 30 24 41 24 41Z" />}
			holes={<circle cx="24" cy="19" r="5.5" />}
		/>
	);
}

export function PhotoGlyph(props: FlatIconProps) {
	return (
		<FlatGlyph
			{...props}
			back={<rect x="10" y="6" width="34" height="28" rx="8" />}
			front={<rect x="4" y="12" width="36" height="30" rx="8" />}
			holes={
				<>
					<circle cx="29" cy="22" r="3.6" />
					<path d="M8 36L17 26L24 33L28 29L36 37V42H8Z" />
				</>
			}
		/>
	);
}

export function DocGlyph(props: FlatIconProps) {
	return (
		<FlatGlyph
			{...props}
			back={<rect x="16" y="4" width="28" height="38" rx="7" />}
			front={<rect x="6" y="8" width="28" height="38" rx="7" />}
			holes={
				<>
					<rect x="12" y="17" width="16" height="3.4" rx="1.7" />
					<rect x="12" y="25" width="16" height="3.4" rx="1.7" />
					<rect x="12" y="33" width="9" height="3.4" rx="1.7" />
				</>
			}
		/>
	);
}

export function VoiceGlyph(props: FlatIconProps) {
	return (
		<FlatGlyph
			{...props}
			back={<path d="M8 22H13A11 11 0 0 0 35 22H40A16 16 0 0 1 26.5 37.8V41H32V45H16V41H21.5V37.8A16 16 0 0 1 8 22Z" />}
			front={<rect x="16" y="3" width="16" height="26" rx="8" />}
		/>
	);
}

function ChatGlyphBase(props: FlatIconProps) {
	return (
		<FlatGlyph
			{...props}
			back={<rect x="22" y="17" width="23" height="19" rx="8" />}
			front={<path d="M13 6H27A9 9 0 0 1 36 15V23A9 9 0 0 1 27 32H21L12 40V31.6A9 9 0 0 1 4 23V15A9 9 0 0 1 13 6Z" />}
			holes={
				<>
					<circle cx="13" cy="19" r="2.4" />
					<circle cx="20" cy="19" r="2.4" />
					<circle cx="27" cy="19" r="2.4" />
				</>
			}
		/>
	);
}

export function AiGlyph(props: FlatIconProps) {
	return <FlatGlyph {...props} back={<path d={STAR_SMALL} />} front={<path d={STAR_BIG} />} />;
}

export function OtherGlyph(props: FlatIconProps) {
	return (
		<FlatGlyph
			{...props}
			back={<circle cx="24" cy="24" r="21" />}
			front={<circle cx="24" cy="24" r="13" />}
			holes={<circle cx="24" cy="24" r="4" />}
		/>
	);
}

/** One glyph per memory kind; the kind's colour comes from the surrounding `--memory-*` variables. */
export const MEMORY_KIND_GLYPHS = {
	place: nudged(PlaceGlyph, [0, -0.2]),
	photo: nudged(PhotoGlyph, [0.4, 1.3]),
	doc: nudged(DocGlyph, [0.1, -1.6]),
	voice: nudged(VoiceGlyph, [0, 1.8]),
	chat: nudged(ChatGlyphBase, [1, 2.2]),
	ai: nudged(AiGlyph, [-1, 0.5]),
	other: OtherGlyph,
} as const;

export const ChatGlyph = nudged(ChatGlyphBase, [1, 2.2]);
