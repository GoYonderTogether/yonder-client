import { Maximize2, Minimize2 } from "lucide-react";
import { type ReactNode, type RefObject, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type CompletionBinding, isBindingPresent } from "./completion/bindings.ts";
import { draftMarkdownMarks } from "./completion/draft-markdown.ts";
import { CompletionHighlight } from "./completion/highlight.tsx";
import type { CompletionToken } from "./completion/tokens.ts";

const DESKTOP_COMPOSER_MAX_LINES = 11;
const DESKTOP_COMPOSER_MAX_SHARE = 0.4;
const MOBILE_COMPOSER_MAX_LINES = 5;
/* The phone draft may take at most this share of the conversation above the dock, keyboard included. */
const MOBILE_COMPOSER_MAX_SHARE = 0.45;

function resizeDesktopEditor(editor: HTMLTextAreaElement, dock: HTMLElement | null, panel: HTMLElement | null) {
	const style = getComputedStyle(editor);
	const lineHeight = Number.parseFloat(style.lineHeight);
	if (!lineHeight || !editor.clientWidth) return;
	const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
	let availableHeight = Infinity;
	if (dock && panel) {
		const limit = panel.getBoundingClientRect().height * DESKTOP_COMPOSER_MAX_SHARE;
		const editorHeight = editor.getBoundingClientRect().height;
		const files = dock.querySelector<HTMLElement>(".composer-files");
		if (files) {
			// Keep the attachment strip scrollable if it would crowd out the first line.
			const otherHeight = dock.getBoundingClientRect().height - editorHeight - files.getBoundingClientRect().height;
			const fileBudget = Math.max(0, limit - otherHeight - lineHeight - padding);
			dock.style.setProperty("--composer-file-height-limit", `${fileBudget}px`);
		}
		availableHeight = limit - (dock.getBoundingClientRect().height - editorHeight);
	}
	const maxLines = Math.max(
		1,
		Math.min(DESKTOP_COMPOSER_MAX_LINES, Math.floor((availableHeight - padding) / lineHeight)),
	);

	const scrollTop = editor.scrollTop;
	// Measure the native wraps even in WebKit without field-sizing, using the full text width.
	editor.style.height = "0px";
	editor.style.overflowY = "hidden";
	const lines = Math.max(1, Math.round((editor.scrollHeight - padding) / lineHeight));
	editor.style.height = `${Math.min(lines, maxLines) * lineHeight + padding}px`;
	editor.style.removeProperty("overflow-y");
	editor.scrollTop = scrollTop;
}

/**
 * The phone draft grows with its text until the line count or the share of the conversation above the
 * dock is reached, then scrolls inside the field. The mirror stays in flow, so it drives the height.
 */
function capMobileEditor(
	editor: HTMLTextAreaElement,
	mirror: HTMLElement,
	dock: HTMLElement | null,
	panel: HTMLElement | null,
) {
	const surface = editor.parentElement;
	const style = getComputedStyle(editor);
	const lineHeight = Number.parseFloat(style.lineHeight);
	if (!surface || !lineHeight) return { lines: 1, maxLines: 1 };
	const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
	let available = Infinity;
	if (dock && panel) {
		const header = panel.querySelector<HTMLElement>("[data-conversation-header]");
		const chat = panel.getBoundingClientRect().height - (header?.getBoundingClientRect().height ?? 0);
		const chrome = dock.getBoundingClientRect().height - editor.getBoundingClientRect().height;
		available = chat * MOBILE_COMPOSER_MAX_SHARE - chrome;
	}
	const maxLines = Math.max(1, Math.min(MOBILE_COMPOSER_MAX_LINES, Math.floor((available - padding) / lineHeight)));
	surface.style.setProperty("--composer-mobile-max-height", `${maxLines * lineHeight + padding}px`);
	return { lines: Math.max(1, Math.round((mirror.scrollHeight - padding) / lineHeight)), maxLines };
}

/** Use the same textarea in and out of the top layer: no draft, cursor or IME handoff. */
export function useComposerEditor(
	input: RefObject<HTMLTextAreaElement | null>,
	draft: string,
	mobile: boolean,
	scope: string,
	hidden: boolean,
) {
	const surface = useRef<HTMLDialogElement>(null);
	const highlight = useRef<HTMLDivElement>(null);
	const [multiline, setMultiline] = useState(false);
	const [overflow, setOverflow] = useState(false);
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
		const dock = editor.closest<HTMLElement>(mobile ? "[data-mobile-dock]" : "[data-native-composer]");
		const panel = dock?.parentElement ?? null;
		const sync = () => {
			if (mobile) {
				editor.style.removeProperty("height");
				mirror.style.removeProperty("width");
				const layout = editor.closest(".composer-layout");
				const control = layout?.querySelector<HTMLElement>(".composer-tool, .composer-send, .composer-hold-to-talk");
				const rowHeight = control?.getBoundingClientRect().height ?? 0;
				if (rowHeight && !fullscreen && !hidden) {
					const { lines, maxLines } = capMobileEditor(editor, mirror, dock, panel);
					setMultiline(Boolean(draft) && mirror.clientHeight > rowHeight + 1);
					setOverflow(lines > maxLines);
				}
			} else {
				resizeDesktopEditor(editor, dock, panel);
				mirror.style.width = `${editor.clientWidth}px`;
			}
			mirror.scrollTop = editor.scrollTop;
		};
		sync();
		const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(sync);
		observer?.observe(editor);
		observer?.observe(mirror);
		if (dock) observer?.observe(dock);
		if (panel) observer?.observe(panel);
		return () => observer?.disconnect();
	}, [input, draft, mobile, fullscreen, hidden]);

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
	return { surface, highlight, multiline, overflow, fullscreen, toggle, onClose };
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
				{mobile && (editor.fullscreen || (editor.overflow && !readOnly)) ? (
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
