import type { ReactNode } from "react";
import type { FlatIconProps } from "./flat-icon.tsx";
import { FlatGlyph, nudged } from "./flat-icon.tsx";

export type FileGlyphType =
	| "pdf"
	| "word"
	| "spreadsheet"
	| "slides"
	| "video"
	| "audio"
	| "image"
	| "text"
	| "generic";

export type FileGlyphProps = FlatIconProps & { color?: string | undefined };

/** One folded page for every file; only what is cut out of it tells the types apart. */
const PAGE =
	"M16 4H26A2 2 0 0 1 28 6V11A5 5 0 0 0 33 16H38A2 2 0 0 1 40 18V37A7 7 0 0 1 33 44H16A7 7 0 0 1 9 37V11A7 7 0 0 1 16 4Z";
const FOLD = "M28 4L40 16H33A5 5 0 0 1 28 11Z";
const CUT = { stroke: "black", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

const HOLES: Record<FileGlyphType, ReactNode> = {
	text: (
		<>
			<rect x="15" y="23" width="18" height="3.2" rx="1.6" />
			<rect x="15" y="30" width="18" height="3.2" rx="1.6" />
			<rect x="15" y="37" width="10" height="3.2" rx="1.6" />
		</>
	),
	word: <path d="M14 24L18.5 38L24 27L29.5 38L34 24" {...CUT} />,
	pdf: (
		<>
			<rect x="15" y="22" width="12" height="3.2" rx="1.6" />
			<path d="M15 38Q19 28 24 33T33 30" {...CUT} />
		</>
	),
	spreadsheet: (
		<>
			<rect x="15" y="22" width="8" height="5" rx="1.5" />
			<rect x="25" y="22" width="8" height="5" rx="1.5" />
			<rect x="15" y="29" width="8" height="5" rx="1.5" />
			<rect x="25" y="29" width="8" height="5" rx="1.5" />
			<rect x="15" y="36" width="8" height="4" rx="1.5" />
			<rect x="25" y="36" width="8" height="4" rx="1.5" />
		</>
	),
	slides: (
		<>
			<rect x="14" y="32" width="5" height="8" rx="1.5" />
			<rect x="22" y="25" width="5" height="15" rx="1.5" />
			<rect x="30" y="29" width="5" height="11" rx="1.5" />
		</>
	),
	video: <path d="M20 24L32 31L20 38Z" stroke="black" strokeWidth={2} strokeLinejoin="round" />,
	audio: (
		<>
			<circle cx="21" cy="37" r="4" />
			<rect x="24" y="22" width="3" height="15" rx="1.5" />
			<path d="M27 22Q34 23 33 29Q31 26 27 26Z" />
		</>
	),
	image: (
		<>
			<circle cx="29" cy="25" r="3" />
			<path d="M13 40L21 30L26 36L29 33L36 40Z" />
		</>
	),
	generic: null,
};

export function FileGlyph({ type, ...props }: FileGlyphProps & { type: FileGlyphType }) {
	return <FlatGlyph {...props} back={<path d={FOLD} />} front={<path d={PAGE} />} holes={HOLES[type]} />;
}

function FolderGlyphBase(props: FileGlyphProps) {
	return (
		<FlatGlyph
			{...props}
			back={<path d="M4 14A6 6 0 0 1 10 8H19Q22 8 24 11H38A6 6 0 0 1 44 17V30H4Z" />}
			front={<rect x="4" y="16" width="40" height="26" rx="7" />}
		/>
	);
}

export const FolderGlyph = nudged(FolderGlyphBase, [0.1, -2.2]);
