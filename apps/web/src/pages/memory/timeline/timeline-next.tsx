import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/** The node an event leads to, on another day. */
export interface NextTarget {
	id: string;
	title: string;
}

/**
 * A small dashed arrow on a node whose next one lies on another day. It takes no row of its own: it sits at the
 * corner of the card and floats once while it is on screen. The next node's title shows only under the pointer.
 * Pressing it scrolls there.
 */
export function NextArrow({ target }: { target: NextTarget }) {
	const { t } = useTranslation();
	const button = useRef<HTMLButtonElement>(null);
	const [live, setLive] = useState(false);
	useEffect(() => {
		const element = button.current;
		if (!element || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver((entries) => setLive(entries.some((entry) => entry.isIntersecting)));
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return (
		<button
			ref={button}
			type="button"
			className="tl-next"
			data-live={live || undefined}
			aria-label={`${t("memory.nextNode")}: ${target.title}`}
			onClick={() =>
				document.getElementById(`memory-entry-${target.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })
			}
		>
			<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden>
				<path className="tl-next-line" d="M10 2 C 4 6, 16 10, 10 16" />
				<path d="M6.5 13 L10 16.5 L13.5 13" />
			</svg>
			<span className="tl-next-tip">{target.title}</span>
		</button>
	);
}
