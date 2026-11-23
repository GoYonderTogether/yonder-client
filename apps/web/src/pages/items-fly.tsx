import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./items.css";

export type PresetSource = { label: string; bounds: DOMRect };

export function PresetFlight({
	source,
	mobile,
	onDone,
}: {
	source: PresetSource;
	mobile: boolean;
	onDone: () => void;
}) {
	const ref = useRef<HTMLSpanElement>(null);
	useLayoutEffect(() => {
		const label = ref.current;
		const composerSelector = mobile ? "[data-preset-composer] .composer-box" : "[data-native-composer] .composer-box";
		const target = document.querySelector(mobile ? "[data-bot-tab]" : composerSelector);
		const style = getComputedStyle(document.documentElement);
		const time = style.getPropertyValue("--duration-slower").trim();
		const duration = Number.parseFloat(time) * (time.endsWith("ms") ? 1 : 1000);
		if (!label || !target || !Number.isFinite(duration)) {
			onDone();
			return;
		}
		const start = source.bounds;
		const finish = target.getBoundingClientRect();
		const x = finish.x + finish.width / 2 - (start.x + start.width / 2);
		const y = finish.y + finish.height / 2 - (start.y + start.height / 2);
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const flight = reduced
			? null
			: label.animate(
					[
						{ opacity: 1, transform: "translate(0, 0) scale(1)" },
						{ opacity: 1, transform: `translate(${x * 0.67}px, ${y * 0.76}px) scale(0.88)`, offset: 0.65 },
						{ opacity: 0, transform: `translate(${x}px, ${y}px) scale(0.55)` },
					],
					{ duration, easing: style.getPropertyValue("--ease-standard").trim(), fill: "forwards" },
				);
		let pulse: Animation | undefined;
		let active = true;
		void (flight?.finished ?? Promise.resolve())
			.then(() => {
				if (!active) return;
				const composer = document.querySelector(composerSelector);
				if (!composer) return;
				pulse = composer.animate(
					[
						{ boxShadow: "0 0 0 0 var(--color-accent-subtle)" },
						{ boxShadow: "0 0 0 var(--spacing-1) var(--color-accent-subtle)", offset: 0.22 },
						{ boxShadow: "0 0 0 var(--spacing-1) transparent" },
					],
					{ duration: reduced ? 160 : duration },
				);
				return pulse.finished;
			})
			.then(() => {
				if (active) onDone();
			})
			.catch(() => {});
		return () => {
			active = false;
			flight?.cancel();
			pulse?.cancel();
		};
	}, [mobile, onDone, source]);

	return createPortal(
		<span
			ref={ref}
			data-preset-flight
			aria-hidden
			className="items-fly"
			style={{ left: source.bounds.x, top: source.bounds.y }}
		>
			{source.label}
		</span>,
		document.body,
	);
}
