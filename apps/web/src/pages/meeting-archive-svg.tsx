import { createElement, type ReactNode } from "react";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const shapes = new Set(["g", "path", "rect", "circle", "ellipse", "line", "polygon", "polyline", "text"]);
const numericAttributes = new Set(["x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height"]);
const namedAttributes = {
	"stroke-width": "strokeWidth",
	"font-size": "fontSize",
	"text-anchor": "textAnchor",
	"dominant-baseline": "dominantBaseline",
} as const;
const numberPattern = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/gu;

function numbers(value: string) {
	if (value.replace(numberPattern, "").replace(/[\s,]/gu, "")) return null;
	const parsed = [...value.matchAll(numberPattern)].map((match) => Number(match[0]));
	return parsed.length && parsed.every((number) => Number.isFinite(number) && Math.abs(number) <= 10_000)
		? parsed
		: null;
}

function safeAttribute(name: string, value: string) {
	if (numericAttributes.has(name) || name === "stroke-width" || name === "font-size")
		return (numbers(value)?.length ?? 0) === 1 && /^\s*[^\s,]+\s*$/u.test(value);
	if (name === "fill" || name === "stroke")
		return /^(?:none|transparent|currentColor|black|white|#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8}))$/iu.test(value);
	if (name === "text-anchor") return /^(?:start|middle|end)$/u.test(value);
	if (name === "dominant-baseline") return /^(?:auto|middle|central|hanging|alphabetic)$/u.test(value);
	if (name === "points") return (numbers(value)?.length ?? 1) % 2 === 0;
	if (name === "d")
		return (
			/^[Mm][MmZzLlHhVvCcSsQqTtAaEe0-9+.,\s-]*$/u.test(value) &&
			Boolean(numbers(value.replace(/[MmZzLlHhVvCcSsQqTtAa]/gu, "")))
		);
	return false;
}

/** Interpret a small diagram vocabulary; model markup is never inserted into the DOM. */
export function renderMeetingArchiveSvg(source: string, label: string): ReactNode {
	if (typeof DOMParser === "undefined" || source.length > 12_000 || /<!|<\?/u.test(source)) return null;
	const root = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
	if (root.tagName !== "svg" || (root.namespaceURI !== null && root.namespaceURI !== SVG_NAMESPACE)) return null;
	if (
		[...root.attributes].some(({ name, value }) => name !== "viewBox" && !(name === "xmlns" && value === SVG_NAMESPACE))
	)
		return null;
	const viewBox = numbers(root.getAttribute("viewBox") ?? "");
	if (viewBox?.length !== 4 || (viewBox[2] ?? 0) < 1 || (viewBox[3] ?? 0) < 1) return null;

	let remaining = 100;
	function draw(element: Element, key: number, depth: number): ReactNode {
		if (--remaining < 0 || depth > 8 || element.namespaceURI !== root.namespaceURI || !shapes.has(element.tagName))
			throw new Error("Unsupported SVG shape");
		const props: Record<string, string | number> = { key };
		for (const { name, value, namespaceURI } of element.attributes) {
			if (namespaceURI !== null || !safeAttribute(name, value)) throw new Error("Unsupported SVG attribute");
			props[namedAttributes[name as keyof typeof namedAttributes] ?? name] = value;
		}
		const text = element.textContent ?? "";
		if (element.tagName === "text") {
			if (element.children.length || text.length > 240) throw new Error("Unsupported SVG label");
			return createElement("text", props, text);
		}
		if ([...element.childNodes].some((node) => node.nodeType === 3 && node.textContent?.trim()))
			throw new Error("Unsupported SVG text");
		if (element.children.length && element.tagName !== "g") throw new Error("Unsupported SVG structure");
		return createElement(
			element.tagName,
			props,
			[...element.children].map((child, i) => draw(child, i, depth + 1)),
		);
	}

	try {
		if (!root.children.length) return null;
		return (
			<svg className="recording-reader-diagram" viewBox={viewBox.join(" ")} role="img" aria-label={label}>
				{[...root.children].map((child, i) => draw(child, i, 0))}
			</svg>
		);
	} catch {
		return null;
	}
}
