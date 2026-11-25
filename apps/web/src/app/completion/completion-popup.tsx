import { Avatar } from "@yonder/ui-components";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import { COMPLETION_PAGE_SIZE } from "./tokens.ts";
import type { useComposerCompletion } from "./use-composer-completion.ts";
import "./completion.css";

/** A touch keyboard has no Enter or arrow keys, so a key hint there would describe something absent. */
function keyboardAvailable() {
	if (typeof window === "undefined" || !window.matchMedia) return true;
	return window.matchMedia("(any-pointer: fine)").matches;
}

/**
 * A member row is a face and a name. The Bot-versus-person difference is already the avatar's shape;
 * the handle appears only where two people share a display name and the name alone cannot choose.
 */
function MemberName({
	item,
}: {
	item: { name: string; handle?: string | undefined; showHandle?: boolean | undefined };
}) {
	return (
		<>
			<span>{item.name}</span>
			{item.showHandle && item.handle ? <span className="composer-completion-handle">@{item.handle}</span> : null}
		</>
	);
}

export function CompletionPopup({ completion }: { completion: ReturnType<typeof useComposerCompletion> }) {
	const { t } = useTranslation();
	useLayoutEffect(() => {
		const popup = completion.popup.current;
		if (!popup || !completion.token) return;
		const viewport = window.visualViewport;
		const resize = () =>
			popup.style.setProperty("--completion-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
		resize();
		viewport?.addEventListener("resize", resize);
		return () => viewport?.removeEventListener("resize", resize);
	}, [completion.popup, completion.token]);
	useLayoutEffect(() => {
		if (completion.token)
			document.getElementById(`${completion.id}-${completion.active}`)?.scrollIntoView?.({ block: "nearest" });
	}, [completion.active, completion.id, completion.token]);
	if (!completion.token) return null;
	const { matches, active, page, id } = completion;
	const pages = Math.ceil(matches.length / COMPLETION_PAGE_SIZE);
	const mentions = completion.token.prefix === "@";
	// A member list needs no heading: it is a short list of faces. The address book still names its
	// two kinds; other mention lists say nothing they would have to translate.
	const heading = mentions
		? matches.some((item) => item.keyboardHint)
			? t("skills.members")
			: null
		: t("skills.commandsAndSkills");
	// Key hints describe a keyboard. Only the Bot chat's list asks for them, and a touch screen keeps
	// the hint out because it has no such keys to press.
	const hint = keyboardAvailable() && (!mentions || matches.some((item) => item.keyboardHint));
	return (
		<div className="composer-completion" ref={completion.popup}>
			{heading ? <div className="composer-completion-heading">{heading}</div> : null}
			<div id={id} role="listbox" aria-label={t("skills.suggestions")}>
				{matches.slice(page * COMPLETION_PAGE_SIZE, (page + 1) * COMPLETION_PAGE_SIZE).map((item, offset) => {
					const index = page * COMPLETION_PAGE_SIZE + offset;
					return (
						<button
							key={item.id}
							id={`${id}-${index}`}
							type="button"
							role="option"
							tabIndex={-1}
							aria-selected={index === active}
							disabled={!completion.canAccept(item)}
							onPointerDown={(event) => event.preventDefault()}
							onClick={() => completion.accept(item)}
						>
							<span className="composer-completion-name">
								{item.kind === "member" ? (
									<Avatar name={item.name} src={item.avatarUrl} kind={item.memberKind} size={24} />
								) : null}
								{item.kind === "member" ? (
									<MemberName item={item} />
								) : (
									<>
										<span>{item.name}</span>
										{item.displayNameZh ? <span className="composer-completion-zh">{item.displayNameZh}</span> : null}
										<small>
											{t(item.kind === "skill" ? `skills.source.${item.source ?? "user"}` : "skills.command")}
										</small>
									</>
								)}
							</span>
							{item.kind === "member" ? null : (
								<span className="composer-completion-description">{item.description}</span>
							)}
						</button>
					);
				})}
			</div>
			{!matches.length ? <p role="status">{t("skills.noSuggestions")}</p> : null}
			{matches.some((item) => !completion.canAccept(item)) ? <p role="status">{t("skills.selectionLimit")}</p> : null}
			{hint ? (
				<div className="composer-completion-footer">
					<span>{t("skills.acceptHint")}</span>
				</div>
			) : null}
			{pages > 1 ? (
				<div className="composer-completion-pager">
					<button
						type="button"
						tabIndex={-1}
						aria-label={t("skills.previousPage")}
						disabled={page === 0}
						onPointerDown={(event) => event.preventDefault()}
						onClick={() => completion.setPage(-1)}
					>
						<ChevronLeft size={14} aria-hidden />
					</button>
					<span>{t("skills.page", { current: page + 1, total: pages })}</span>
					<button
						type="button"
						tabIndex={-1}
						aria-label={t("skills.nextPage")}
						disabled={page === pages - 1}
						onPointerDown={(event) => event.preventDefault()}
						onClick={() => completion.setPage(1)}
					>
						<ChevronRight size={14} aria-hidden />
					</button>
				</div>
			) : null}
		</div>
	);
}
