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

export function botFaceFor(key: string): BotFaceId {
	let hash = 0;
	for (const character of key) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 997;
	return BOT_FACE_IDS[hash % BOT_FACE_IDS.length] as BotFaceId;
}

export function firstCharacter(name: string): string {
	const trimmed = name.trim();
	return trimmed === "" ? "?" : ([...trimmed][0] as string).toUpperCase();
}

/**
 * Six muted tints, defined as tokens so no colour literal lives in a component. Fixed, not random:
 * the same name must get the same colour on every device, and these are neutral enough not to
 * compete with the accent.
 */
const TINTS = [
	["var(--color-avatar-1-bg)", "var(--color-avatar-1-fg)"],
	["var(--color-avatar-2-bg)", "var(--color-avatar-2-fg)"],
	["var(--color-avatar-3-bg)", "var(--color-avatar-3-fg)"],
	["var(--color-avatar-4-bg)", "var(--color-avatar-4-fg)"],
	["var(--color-avatar-5-bg)", "var(--color-avatar-5-fg)"],
	["var(--color-avatar-6-bg)", "var(--color-avatar-6-fg)"],
] as const;

export function tintFor(name: string): { background: string; foreground: string } {
	let hash = 0;
	for (const character of name) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 997;
	const [background, foreground] = TINTS[hash % TINTS.length] as readonly [string, string];
	return { background, foreground };
}
