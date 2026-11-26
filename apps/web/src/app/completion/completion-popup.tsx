import { Avatar } from "@yonder/ui-components";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import { COMPLETION_PAGE_SIZE } from "./tokens.ts";
import type { useComposerCompletion } from "./use-composer-completion.ts";
import "./completion.css";

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
	return (
		<div className="composer-completion" ref={completion.popup}>
			<div className="composer-completion-heading">
				{t(completion.token.prefix === "@" ? "skills.members" : "skills.commandsAndSkills")}
			</div>
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
								<span>{item.name}</span>
								{item.displayNameZh ? <span className="composer-completion-zh">{item.displayNameZh}</span> : null}
								<small>
									{item.kind === "skill"
										? t(`skills.source.${item.source ?? "user"}`)
										: t(
												item.kind === "command"
													? "skills.command"
													: item.memberKind === "bot"
														? "skills.bot"
														: "skills.contact",
											)}
								</small>
							</span>
							<span className="composer-completion-description">{item.description}</span>
						</button>
					);
				})}
			</div>
			{!matches.length ? <p role="status">{t("skills.noSuggestions")}</p> : null}
			{matches.some((item) => !completion.canAccept(item)) ? <p role="status">{t("skills.selectionLimit")}</p> : null}
			<div className="composer-completion-footer">
				<span>{t("skills.acceptHint")}</span>
				{pages > 1 ? (
					<span className="composer-completion-pagination">
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
					</span>
				) : null}
			</div>
		</div>
	);
}
