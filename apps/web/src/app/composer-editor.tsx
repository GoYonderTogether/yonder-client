import { Maximize2, Minimize2 } from "lucide-react";
import { type ReactNode, type RefObject, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type CompletionBinding, isBindingPresent } from "./completion/bindings.ts";
import { draftMarkdownMarks } from "./completion/draft-markdown.ts";
import { CompletionHighlight } from "./completion/highlight.tsx";
import type { CompletionToken } from "./completion/tokens.ts";

/** Use the same textarea in and out of the top layer: no draft, cursor or IME handoff. */
export function useComposerEditor(
	input: RefObject<HTMLTextAreaElement | null>,
	draft: string,
	mobile: boolean,
	scope: string,
	hidden: boolean,
	fileCount: number,
) {
	const surface = useRef<HTMLDialogElement>(null);
	const highlight = useRef<HTMLDivElement>(null);
	const [expanded, setExpanded] = useState(false);
	const [multiline, setMultiline] = useState(false);
	const fullscreenScope = useRef<string | null>(null);
	const [fullscreen, setFullscreen] = useState(false);

	useLayoutEffect(() => {
		const node = surface.current;
		if (node?.open && fullscreenScope.current !== null && (fullscreenScope.current !== scope || !mobile || hidden)) {
			node.close();
		}
	}, [scope, mobile, hidden]);

	useLayoutEffect(() => {
		const editor = input.current;
		const mirror = highlight.current;
		if (!editor || !mirror) return;
		const sync = () => {
			if (!mobile) mirror.style.width = `${editor.clientWidth}px`;
			else mirror.style.removeProperty("width");
			mirror.scrollTop = editor.scrollTop;
			const style = getComputedStyle(editor);
			const rowHeight = Number.parseFloat(style.getPropertyValue("--composer-button-size"));
			if (mobile) {
				if (!fullscreen && !hidden) setMultiline(Boolean(draft) && mirror.clientHeight > rowHeight + 1);
			} else if (!draft && !fileCount) setExpanded(false);
			else if (editor.clientHeight > rowHeight * 1.4) setExpanded(true);
		};
		sync();
		const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(sync);
		observer?.observe(editor);
		observer?.observe(mirror);
		return () => observer?.disconnect();
	}, [input, draft, mobile, fileCount, fullscreen, hidden]);

	function toggle() {
		const node = surface.current;
		const editor = input.current;
		if (!node || !editor) return;
		if (fullscreenScope.current !== null) {
			if (node.dataset.closing) return;
			const duration = Number.parseFloat(getComputedStyle(node).animationDuration) * 1000;
			if (duration > 0 && typeof node.animate === "function") {
				node.dataset.closing = "true";
				const animation = node.animate(
					[
						{ transform: "translateY(0)", opacity: 1 },
						{ transform: "translateY(var(--spacing-6))", opacity: 0 },
					],
					{ duration, easing: "ease-in", fill: "forwards" },
				);
				const close = () => {
					delete node.dataset.closing;
					if (node.open) node.close();
					animation.cancel();
				};
				void animation.finished.then(close, close);
			} else node.close();
			return;
		}
		fullscreenScope.current = scope;
		node.removeAttribute("open");
		node.showModal();
		editor.focus({ preventScroll: true });
		setFullscreen(true);
	}
	const onClose = () => {
		fullscreenScope.current = null;
		surface.current?.setAttribute("open", "");
		setFullscreen(false);
	};
	return { surface, highlight, expanded, multiline, fullscreen, toggle, onClose };
}

export function ComposerEditor({
	editor,
	text,
	bindings,
	token,
	hidden,
	mobile,
	readOnly,
	popup,
	children,
}: {
	editor: ReturnType<typeof useComposerEditor>;
	text: string;
	bindings: readonly CompletionBinding[];
	token: CompletionToken | null;
	hidden: boolean;
	mobile: boolean;
	readOnly: boolean;
	popup: ReactNode;
	children: ReactNode;
}) {
	const { t } = useTranslation();
	const markdown = useMemo(() => draftMarkdownMarks(text), [text]);
	const highlighted = Boolean(markdown.length || token || bindings.some((binding) => isBindingPresent(text, binding)));
	return (
		<div className="composer-editor" hidden={hidden}>
			<dialog
				ref={editor.surface}
				open
				className="composer-input-surface"
				role={editor.fullscreen ? undefined : "presentation"}
				aria-label={editor.fullscreen ? t("chat.textInput") : undefined}
				data-highlighted={highlighted || undefined}
				onClose={editor.onClose}
				onKeyDown={(event) => {
					// Escape belongs to the dialog, not the underlying conversation navigation layer.
					if (editor.fullscreen && event.key === "Escape") event.stopPropagation();
				}}
				onCancel={(event) => {
					event.preventDefault();
					editor.toggle();
				}}
			>
				<div ref={editor.highlight} className="composer-highlight composer-text-style" aria-hidden="true">
					<CompletionHighlight text={text} bindings={bindings} token={token} markdown={markdown} />
				</div>
				{children}
				{mobile && (editor.fullscreen || (editor.multiline && !readOnly)) ? (
					<button
						type="button"
						className="composer-tool composer-fullscreen-toggle"
						aria-label={t(editor.fullscreen ? "chat.collapseComposer" : "chat.expandComposer")}
						aria-expanded={editor.fullscreen}
						onPointerDown={(event) => event.preventDefault()}
						onClick={editor.toggle}
					>
						{editor.fullscreen ? <Minimize2 size={17} aria-hidden /> : <Maximize2 size={17} aria-hidden />}
					</button>
				) : null}
				{popup}
			</dialog>
		</div>
	);
}
