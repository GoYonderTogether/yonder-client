import type { ComponentType, CSSProperties, ReactNode } from "react";
import { Fragment, useEffect, useState } from "react";

const graphemes =
	typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
		? new Intl.Segmenter(undefined, { granularity: "grapheme" })
		: null;
export type ChatTextHost = ComponentType<{ className?: string; style?: CSSProperties; children?: ReactNode }> | "span";

interface Batch {
	text: string;
	characters: { text: string; key: string; position: number }[];
	startAt: number;
	delay: number;
	until: number;
}

/** Settled text returns to one text node; only arriving characters keep animation spans. */
export function StreamingText({ text, as }: { text: string; as: ChatTextHost }) {
	return graphemes ? <GraphemeStreaming text={text} as={as} segmenter={graphemes} /> : text;
}
function GraphemeStreaming({
	text,
	as: Element,
	segmenter,
}: {
	text: string;
	as: ChatTextHost;
	segmenter: Intl.Segmenter;
}) {
	const [state, setState] = useState(() => ({ source: "", settled: "", batches: [] as Batch[] }));
	if (state.source !== text) {
		const append = text.startsWith(state.source);
		let settled = append ? state.settled : "";
		let batches = append ? state.batches : [];
		let consumed = append ? state.source.length : 0;
		// A transport chunk can end halfway through an emoji or combining sequence.
		const previousTail = append ? [...segmenter.segment(state.source)].at(-1) : undefined;
		const joinedTail = previousTail ? segmenter.segment(text).containing(previousTail.index) : undefined;
		if (previousTail && joinedTail && joinedTail.segment !== previousTail.segment) {
			const extension = joinedTail.segment.slice(previousTail.segment.length);
			consumed += extension.length;
			const pending = batches.at(-1);
			if (pending) {
				batches = [
					...batches.slice(0, -1),
					{
						...pending,
						text: pending.text + extension,
						characters: pending.characters.map((character, index) =>
							index === pending.characters.length - 1 ? { ...character, text: character.text + extension } : character,
						),
					},
				];
			} else settled += extension;
		}
		const suffix = text.slice(consumed);
		const last = batches.at(-1);
		const now = Date.now();
		const startAt = Math.max(now, last ? last.startAt + last.characters.length * 30 : now);
		const characters = [...segmenter.segment(suffix)].map((character, position) => ({
			text: character.segment,
			key: `${consumed}-${character.index}`,
			position,
		}));
		const batch = {
			text: suffix,
			characters,
			startAt,
			delay: startAt - now,
			until: startAt + 90 + Math.max(0, characters.length - 1) * 30,
		};
		setState({
			source: text,
			settled,
			batches: characters.length ? [...batches, batch] : batches,
		});
	}
	const first = state.batches[0];
	useEffect(() => {
		if (!first) return;
		const timer = setTimeout(
			() => {
				setState((current) => {
					if (current.batches[0] !== first) return current;
					return { ...current, settled: current.settled + first.text, batches: current.batches.slice(1) };
				});
			},
			Math.max(0, first.until - Date.now()),
		);
		return () => clearTimeout(timer);
	}, [first]);
	return (
		<>
			{state.settled}
			{state.batches.map((batch) => (
				<Fragment key={batch.characters[0]?.key}>
					{batch.characters.map((character) => (
						<Element
							key={character.key}
							className="stream-character"
							style={{ "--character-index": character.position, "--batch-delay": `${batch.delay}ms` } as CSSProperties}
						>
							{character.text}
						</Element>
					))}
				</Fragment>
			))}
		</>
	);
}
