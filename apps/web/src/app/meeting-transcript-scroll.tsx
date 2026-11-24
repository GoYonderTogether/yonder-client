import { IconButton } from "@yonder/ui-components";
import { ArrowDown } from "lucide-react";
import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const NEAR_END = 48;

type ReaderAnchor = { row: Element; top: number };

function distanceFromEnd(scroll: HTMLElement) {
	return scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
}

function captureAnchor(scroll: HTMLElement): ReaderAnchor | null {
	const top = scroll.getBoundingClientRect().top;
	const rows = scroll.querySelector("[role=log]")?.children ?? [];
	for (const row of rows) {
		const rect = row.getBoundingClientRect();
		if (rect.bottom > top) return { row, top: rect.top - top };
	}
	return null;
}

export function MeetingTranscriptScroll({
	transcript,
	photos,
	children,
}: {
	transcript: readonly unknown[];
	photos: readonly unknown[];
	children: ReactNode;
}) {
	const { t } = useTranslation();
	const thread = useRef<HTMLElement>(null);
	const follow = useRef(true);
	const anchor = useRef<ReaderAnchor | null>(null);
	const commandedTop = useRef<number | undefined>(undefined);
	const [detached, setDetached] = useState(false);

	const update = useCallback(() => {
		const node = thread.current;
		if (!node?.clientHeight) return;
		if (follow.current) {
			const previousTop = node.scrollTop;
			node.scrollTop = node.scrollHeight;
			if (node.scrollTop !== previousTop) commandedTop.current = node.scrollTop;
			return;
		}
		const old = anchor.current;
		if (old?.row.isConnected) {
			// A delayed turn can move a saved photo above the reader. Anchor the same visible row.
			const offset = old.row.getBoundingClientRect().top - node.getBoundingClientRect().top;
			if (Math.abs(offset - old.top) > 0.5) {
				node.scrollTop += offset - old.top;
				commandedTop.current = node.scrollTop;
			}
		}
		follow.current = distanceFromEnd(node) <= NEAR_END;
		setDetached(!follow.current);
		anchor.current = follow.current ? null : captureAnchor(node);
	}, []);

	useLayoutEffect(() => {
		if (transcript.length || photos.length) update();
	}, [update, transcript, photos]);
	useLayoutEffect(() => {
		const node = thread.current;
		const content = node?.firstElementChild;
		if (!node || !content || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(update);
		observer.observe(node);
		observer.observe(content);
		return () => observer.disconnect();
	}, [update]);

	return (
		<div className="meeting-transcript-panel">
			<section
				className="meeting-transcript"
				ref={thread}
				aria-label={t("meetingRecorder.liveTitle")}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to read and scroll this region
				tabIndex={0}
				onScroll={({ currentTarget }) => {
					if (!currentTarget.clientHeight) return;
					const top = currentTarget.scrollTop;
					if (top === commandedTop.current) {
						commandedTop.current = undefined;
						return;
					}
					commandedTop.current = undefined;
					follow.current = distanceFromEnd(currentTarget) <= NEAR_END;
					setDetached(!follow.current);
					anchor.current = follow.current ? null : captureAnchor(currentTarget);
				}}
			>
				<div className="meeting-transcript-inner">{children}</div>
			</section>
			{detached ? (
				<IconButton
					aria-label={t("chat.jumpToLatest")}
					variant="secondary"
					className="meeting-transcript-jump"
					onClick={() => {
						follow.current = true;
						anchor.current = null;
						setDetached(false);
						update();
						thread.current?.focus({ preventScroll: true });
					}}
				>
					<ArrowDown size={16} aria-hidden="true" />
				</IconButton>
			) : null}
		</div>
	);
}
