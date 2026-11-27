import type { ReactNode } from "react";
import { useId } from "react";
import type { TabId } from "../navigation/routes.ts";

export interface TabIconProps {
	selected: boolean;
	size: number;
	className?: string | undefined;
}

/**
 * Flat two-layer glyphs on a 48 × 48 canvas, one ink for every tab: they take the text colour of the
 * button around them (primary when current, tertiary otherwise), so the set reads as one family.
 * The back layer is the same ink at 40%. Details are cut out with a mask, never painted in a
 * background colour, because the dock behind them is translucent. `nudge` moves the drawing so its
 * visual centre sits on the middle of the canvas, horizontally and vertically.
 * The size is computed here instead of leaning on CSS `zoom`, which WebKit does not apply to masks.
 */
function TabGlyph({
	selected,
	size,
	className,
	nudge,
	back,
	front,
	holes,
}: TabIconProps & { nudge: [number, number]; back: ReactNode; front: ReactNode; holes?: ReactNode }) {
	const mask = useId().replace(/[^a-zA-Z0-9_-]/g, "");
	const box = `calc(${size}px * var(--ui-scale, 1))`;
	return (
		<svg
			viewBox="0 0 48 48"
			aria-hidden="true"
			className={className}
			style={{ zoom: 1, width: box, height: box, flexShrink: 0 }}
			data-selected={selected || undefined}
		>
			<g transform={`translate(${nudge[0]} ${nudge[1]})`}>
				<mask id={mask} maskUnits="userSpaceOnUse" x="-8" y="-8" width="64" height="64">
					<rect x="-8" y="-8" width="64" height="64" fill="white" />
					<g fill="black" stroke="black" strokeWidth={0}>
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

function MessagesIcon(props: TabIconProps) {
	return (
		<TabGlyph
			{...props}
			nudge={[1, 2]}
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

function TasksIcon(props: TabIconProps) {
	return (
		<TabGlyph
			{...props}
			nudge={[1, -1]}
			back={<rect x="14" y="6" width="28" height="34" rx="8" />}
			front={
				<>
					<rect x="6" y="10" width="30" height="34" rx="8" />
					<rect x="13" y="3" width="16" height="12" rx="5" />
				</>
			}
			holes={
				<>
					<rect x="13" y="3" width="16" height="12" rx="5" fill="none" stroke="black" strokeWidth={3} />
					<path
						d="M12.5 24l2.8 2.8 5-5.6"
						fill="none"
						stroke="black"
						strokeWidth={2.6}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
					<rect x="24" y="23" width="8" height="3.2" rx="1.6" />
					<circle cx="15.5" cy="35" r="2.6" />
					<rect x="24" y="33.4" width="8" height="3.2" rx="1.6" />
				</>
			}
		/>
	);
}

function MemoryIcon(props: TabIconProps) {
	return (
		<TabGlyph
			{...props}
			nudge={[-2, 0]}
			back={<path d="M40 5Q41.2 9.8 46 11Q41.2 12.2 40 17Q38.8 12.2 34 11Q38.8 9.8 40 5Z" />}
			front={<path d="M16 38A9 9 0 0 1 14.4 20.2A11 11 0 0 1 35.6 18.4A10 10 0 0 1 34 38Z" />}
			holes={
				<>
					<path d="M25 17Q26.4 23.6 33 25Q26.4 26.4 25 33Q23.6 26.4 17 25Q23.6 23.6 25 17Z" />
					<path d="M13.5 28Q14.1 30.4 16.5 31Q14.1 31.6 13.5 34Q12.9 31.6 10.5 31Q12.9 30.4 13.5 28Z" />
				</>
			}
		/>
	);
}

function ContactsIcon(props: TabIconProps) {
	return (
		<TabGlyph
			{...props}
			nudge={[0.5, -2]}
			back={
				<>
					<circle cx="35" cy="17" r="6" />
					<path d="M24 38A11 11 0 0 1 46 38Z" />
				</>
			}
			front={
				<>
					<circle cx="19" cy="15" r="7.5" />
					<path d="M4 41A15 15 0 0 1 34 41Z" />
				</>
			}
		/>
	);
}

/** One icon per tab, shared by the mobile dock and the desktop rail. */
export const TAB_ICONS: Record<TabId, (props: TabIconProps) => ReactNode> = {
	messages: MessagesIcon,
	tasks: TasksIcon,
	memory: MemoryIcon,
	contacts: ContactsIcon,
};
