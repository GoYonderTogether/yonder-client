import { type ReactNode, useEffect, useReducer } from "react";
import type { ChatHost } from "./index.tsx";

export function InteractionCard({
	as: Element,
	title,
	detail,
	glyph,
	marker,
	label,
	children,
}: {
	as: ChatHost;
	title: ReactNode;
	detail?: ReactNode;
	glyph: ReactNode;
	marker?: ReactNode;
	label?: string;
	children: ReactNode;
}) {
	const accessibility =
		Element === "div" ? { role: "group", "aria-label": label } : { ariaRole: "group", ariaLabel: label };
	return (
		<Element className="interaction-card" data-interaction-card {...accessibility}>
			<Element className="interaction-card-header">
				<Element className="interaction-card-glyph">{glyph}</Element>
				<Element className="interaction-card-heading">
					<Element className="interaction-card-title-row">
						<Element className="interaction-card-title">{title}</Element>
						{marker ? <Element className="interaction-card-marker">{marker}</Element> : null}
					</Element>
					{detail ? <Element className="interaction-card-detail">{detail}</Element> : null}
				</Element>
			</Element>
			{children}
		</Element>
	);
}

export function InteractionCardActions({ as: Element, children }: { as: ChatHost; children: ReactNode }) {
	return <Element className="interaction-card-actions">{children}</Element>;
}

export function useQuestionCountdown(deadlineAt: string | undefined): number | null {
	const deadline = deadlineAt ? Date.parse(deadlineAt) : NaN;
	const [, tick] = useReducer((value: number) => value + 1, 0);
	useEffect(() => {
		if (!Number.isFinite(deadline) || Date.now() >= deadline) return;
		const id = setInterval(() => {
			tick();
			if (Date.now() >= deadline) clearInterval(id);
		}, 1000);
		return () => clearInterval(id);
	}, [deadline]);
	return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null;
}
