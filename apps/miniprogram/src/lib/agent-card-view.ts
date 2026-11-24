import type { AgentCard } from "@yonder/protocol";

/** What a card with choices shows, ready for the option card; null for a kind this client does not draw. */
export interface ChoiceCardView {
	question: string;
	summary: string | undefined;
	/** Markdown the server wants shown before the options, such as the exact things a card will delete. */
	preview: string | undefined;
	result: string | undefined;
	options: string[];
	selected: string | null;
	/** The choice the owner may tap, by the label the card shows; empty once the card is not open. */
	actionFor(label: string): string | undefined;
	open: boolean;
}

export function choiceCardView(card: AgentCard, canAct: boolean): ChoiceCardView | null {
	if (card.body?.type !== "choices") return null;
	const choices = card.body;
	const byLabel = new Map(choices.options.map(({ id, label }) => [label, id]));
	const open = card.state === "open";
	return {
		question: card.title,
		// What is about to happen reads while it can still be chosen; afterwards only what became of it.
		summary: open ? card.summary : undefined,
		preview: card.preview?.kind === "markdown" ? card.preview.text : undefined,
		result: card.result,
		options: choices.options.map(({ label }) => label),
		selected: choices.options.find(({ id }) => id === choices.selected)?.label ?? null,
		actionFor: (label) => (open && canAct ? byLabel.get(label) : undefined),
		open,
	};
}

/** An update never moves a card back to an older version, whichever answer arrives last. */
export function newerCard(current: AgentCard | null, incoming: AgentCard): AgentCard {
	return current && current.version > incoming.version ? current : incoming;
}

/** How many lines of a card preview stay visible before the list scrolls inside the card. */
export const PREVIEW_MAX_LINES = 12;

/**
 * The fixed height a scrolling preview needs, in lines, or null when the preview fits: the mini
 * program's ScrollView scrolls only at a set height, so a short list keeps its natural height.
 */
export function previewHeightLines(markdown: string): number | null {
	let lines = 0;
	for (const line of markdown.split("\n")) {
		if (line.trim()) lines += Math.max(1, Math.ceil(textWidth(line) / PREVIEW_WIDTH_PER_LINE));
	}
	return lines > PREVIEW_MAX_LINES ? PREVIEW_MAX_LINES : null;
}

/** A full-width character takes about twice the room of a Latin one in the narrow card column. */
function textWidth(line: string): number {
	let width = 0;
	for (const character of line) width += FULL_WIDTH.test(character) ? 2 : 1;
	return width;
}

const FULL_WIDTH = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;
/** Room for about 22 full-width characters per rendered line, so the estimate errs on the tall side. */
const PREVIEW_WIDTH_PER_LINE = 44;
