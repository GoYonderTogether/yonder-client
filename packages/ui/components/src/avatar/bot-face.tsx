import { type BotFaceId, botFacePaths } from "@yonder/chat-model";

export type { BotFaceId } from "@yonder/chat-model";
export { BOT_FACE_IDS, botFaceFor } from "@yonder/chat-model";
/**
 * The default Bot face: two flat-topped eyes leaning with the logo's 12° tilt, on the Bot's
 * rounded-square tile. Six faces, picked by the user from a sheet of variants on 2026-11-14:
 * 1 is the main Bot's, the rest give later Bots their own look without a new drawing.
 *
 * Geometry is on a 64 × 64 canvas, centred on (32, 32). Each eye is a rectangle whose bottom is a
 * half circle, so the top edge stays flat like the logo's cut ends.
 */

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
