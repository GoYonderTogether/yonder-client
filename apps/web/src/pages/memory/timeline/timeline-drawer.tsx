import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** Preview only: the drawer that rises from the bottom to show where a reference points. Messages are found by id, not by position, so new ones arriving above never shift the target; the target's background flashes once and settles. */

export interface DrawerLine {
	id: string;
	at: string;
	who: string;
	text: string;
}

export function ChatDrawer({
	title,
	lines,
	anchor,
	onClose,
}: {
	title: string;
	lines: DrawerLine[];
	anchor: string;
	onClose: () => void;
}) {
	const target = useRef<HTMLLIElement>(null);

	useEffect(() => {
		target.current?.scrollIntoView({ block: "center" });
	}, []);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<>
			<button type="button" className="tl-drawer-scrim" aria-label="关闭" onClick={onClose} />
			<aside className="tl-drawer" aria-label={title}>
				<header className="tl-drawer-head">
					<strong>{title}</strong>
					<button type="button" aria-label="关闭" onClick={onClose}>
						<X size={16} aria-hidden />
					</button>
				</header>
				<ol className="tl-drawer-lines">
					{lines.map((line) => (
						<li
							key={line.id}
							ref={line.id === anchor ? target : null}
							className={line.id === anchor ? "tl-line tl-flash" : "tl-line"}
						>
							<time>{line.at}</time>
							<div>
								<p className="tl-line-who">{line.who}</p>
								<p>{line.text}</p>
							</div>
						</li>
					))}
				</ol>
			</aside>
		</>
	);
}
