import { Maximize, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ensureDisplayBlob } from "../lib/image-display.ts";
import { useObjectUrl } from "../lib/use-object-url.ts";
import type { PreviewFile } from "./file-kind.ts";
import { usePreviewTranslation } from "./preview-i18n.ts";

export function ImagePreview({
	file,
	onClose,
	onSwipe,
}: {
	file: PreviewFile;
	onClose: () => void;
	onSwipe?: ((direction: -1 | 1) => void) | undefined;
}) {
	const t = usePreviewTranslation();
	const area = useRef<HTMLButtonElement>(null);
	const [display, setDisplay] = useState<Blob>();
	const [error, setError] = useState(false);
	const [scale, setScale] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const points = useRef(new Map<number, { x: number; y: number }>());
	const gesture = useRef({ distance: 0, scale: 1, x: 0, y: 0, moved: false, blank: false });
	const url = useObjectUrl(display);
	const zoom = (value: number) => setScale(Math.max(0.25, Math.min(8, value)));
	function reset() {
		setScale(1);
		setOffset({ x: 0, y: 0 });
	}
	useEffect(() => {
		let active = true;
		setDisplay(undefined);
		setError(false);
		setScale(1);
		setOffset({ x: 0, y: 0 });
		void ensureDisplayBlob(file.blob, file.name)
			.then((blob) => {
				if (active) setDisplay(blob);
			})
			.catch(() => {
				if (active) setError(true);
			});
		return () => {
			active = false;
		};
	}, [file.blob, file.name]);
	useEffect(() => {
		const element = area.current;
		if (!element) return;
		const wheel = (event: WheelEvent) => {
			event.preventDefault();
			setScale((value) => Math.max(0.25, Math.min(8, value * Math.exp(-event.deltaY * 0.002))));
		};
		element.addEventListener("wheel", wheel, { passive: false });
		return () => element.removeEventListener("wheel", wheel);
	}, []);
	if (error)
		return (
			<p className="attachment-reader-notice" role="status">
				{t("failed")}
			</p>
		);
	return (
		<div className="attachment-image-reader">
			<div className="attachment-reader-toolbar">
				<button type="button" aria-label={t("zoomOut")} onClick={() => zoom(scale / 1.25)}>
					<Minus size={18} />
				</button>
				<output>{Math.round(scale * 100)}%</output>
				<button type="button" aria-label={t("zoomIn")} onClick={() => zoom(scale * 1.25)}>
					<Plus size={18} />
				</button>
				<button type="button" aria-label={t("fit")} onClick={reset}>
					<Maximize size={18} />
				</button>
			</div>
			<button
				type="button"
				ref={area}
				className="attachment-image-area"
				aria-label={t("close")}
				onPointerDown={(event) => {
					if (event.button !== 0) return;
					if (event.pointerType === "mouse") area.current?.setPointerCapture(event.pointerId);
					points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
					gesture.current.moved = false;
					gesture.current.blank = event.target === event.currentTarget;
					gesture.current.x = event.clientX;
					gesture.current.y = event.clientY;
					const [first, second] = [...points.current.values()];
					if (first && second) {
						gesture.current.distance = Math.hypot(first.x - second.x, first.y - second.y);
						gesture.current.scale = scale;
					}
				}}
				onPointerMove={(event) => {
					const previous = points.current.get(event.pointerId);
					if (!previous) return;
					const delta = { x: event.clientX - previous.x, y: event.clientY - previous.y };
					if (Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 4)
						gesture.current.moved = true;
					points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
					const [first, second] = [...points.current.values()];
					if (first && second && gesture.current.distance) {
						zoom(
							(gesture.current.scale * Math.hypot(first.x - second.x, first.y - second.y)) / gesture.current.distance,
						);
					} else if (scale > 1) setOffset((value) => ({ x: value.x + delta.x, y: value.y + delta.y }));
				}}
				onPointerUp={(event) => {
					if (!points.current.has(event.pointerId)) return;
					const dx = event.clientX - gesture.current.x;
					if (
						onSwipe &&
						scale === 1 &&
						points.current.size === 1 &&
						!gesture.current.distance &&
						Math.abs(dx) > 45 &&
						Math.abs(dx) > Math.abs(event.clientY - gesture.current.y) * 1.5
					) {
						gesture.current.moved = true;
						onSwipe(dx > 0 ? -1 : 1);
					}
					points.current.delete(event.pointerId);
					if (!points.current.size) gesture.current.distance = 0;
				}}
				onPointerCancel={() => {
					points.current.clear();
					gesture.current.distance = 0;
				}}
				onLostPointerCapture={(event) => {
					points.current.delete(event.pointerId);
					if (!points.current.size) gesture.current.distance = 0;
				}}
				onClick={(event) => {
					if (event.detail === 0 || (gesture.current.blank && !gesture.current.moved)) onClose();
				}}
				onDoubleClick={() => {
					if (scale === 1) zoom(2);
					else reset();
				}}
			>
				{url ? (
					<img
						src={url}
						alt={file.name}
						draggable={false}
						style={{ transform: `translate(${offset.x}px,${offset.y}px) scale(${scale})` }}
					/>
				) : (
					<p role="status">{t("loading")}</p>
				)}
			</button>
		</div>
	);
}
