import { RecordingGlyph } from "@yonder/ui-components";
import type { LucideProps } from "lucide-react";

/** The recording-note entry: five bars of a recording in the accent colour, lighter ones behind. */
export function RecordingNoteIcon({ size = 20, className }: LucideProps) {
	return (
		<span className={className} style={{ display: "inline-flex" }}>
			<RecordingGlyph size={Number(size)} />
		</span>
	);
}
