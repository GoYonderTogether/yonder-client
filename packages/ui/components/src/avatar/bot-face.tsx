/**
 * The default Bot face: two flat-topped eyes leaning with the logo's 12° tilt, on the Bot's
 * rounded-square tile. Six faces, picked by the user from a sheet of variants on 2026-11-14:
 * 1 is the main Bot's, the rest give later Bots their own look without a new drawing.
 *
 * Geometry is on a 64 × 64 canvas, centred on (32, 32). Each eye is a rectangle whose bottom is a
 * half circle, so the top edge stays flat like the logo's cut ends.
 */

export type BotFaceId = 1 | 2 | 3 | 4 | 5 | 6;

interface FaceGeometry {
	/** Eye width. */
	width: number;
	/** Eye height, including the round bottom. */
	height: number;
	/** Gap between the eyes. */
	gap: number;
	/** Top edge of the eyes. */
	top: number;
	/** Lean, in degrees, around the canvas centre. */
	tilt: number;
}

/** 1 / 1a / 1c and 3 / 3a / 3c from the sheet, in that order. */
const FACES: Record<BotFaceId, FaceGeometry> = {
	1: { width: 9, height: 18, gap: 8, top: 23, tilt: 12 },
	2: { width: 9, height: 18, gap: 8, top: 23, tilt: 8 },
	3: { width: 8.5, height: 17, gap: 9, top: 23.5, tilt: 12 },
	4: { width: 8, height: 16, gap: 10, top: 24, tilt: 12 },
	5: { width: 8, height: 16, gap: 10, top: 24, tilt: 16 },
	6: { width: 7.5, height: 15, gap: 11, top: 24.5, tilt: 12 },
};

export const BOT_FACE_IDS = Object.keys(FACES).map(Number) as BotFaceId[];

function eyePath(x: number, top: number, width: number, height: number): string {
	const radius = width / 2;
	return `M${x} ${top}h${width}v${height - radius}a${radius} ${radius} 0 0 1-${width} 0z`;
}

export function botFacePaths(id: BotFaceId): { left: string; right: string; transform: string } {
	const face = FACES[id];
	const left = 32 - (face.width * 2 + face.gap) / 2;
	return {
		left: eyePath(left, face.top, face.width, face.height),
		right: eyePath(left + face.width + face.gap, face.top, face.width, face.height),
		transform: `rotate(${face.tilt} 32 32)`,
	};
}

/**
 * Stable per Bot: the same id always gets the same face. The main Bot passes `face={1}`; other Bots
 * can derive one from their id so two Bots side by side look different.
 */
export function botFaceFor(key: string): BotFaceId {
	let hash = 0;
	for (const character of key) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 997;
	return BOT_FACE_IDS[hash % BOT_FACE_IDS.length] as BotFaceId;
}

/** Just the eyes, drawn in `currentColor`; the tile behind them belongs to the Avatar. */
export function BotFace({ id = 1, size }: { id?: BotFaceId; size: number }) {
	const paths = botFacePaths(id);
	return (
		<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" data-bot-face={id}>
			<g transform={paths.transform} fill="currentColor">
				<path d={paths.left} />
				<path d={paths.right} />
			</g>
		</svg>
	);
}
