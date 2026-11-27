import type { useMessages } from "@yonder/ui-data";
import { type RefObject, useEffect, useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppNotice } from "../app/app-notice.tsx";

export function useMessageQuoteJump(
	bottom: RefObject<HTMLDivElement | null>,
	{ data, fetchNextPage, hasNextPage, isFetching, isFetchNextPageError }: ReturnType<typeof useMessages>,
) {
	const { t } = useTranslation();
	const notice = useAppNotice();
	const [request, setRequest] = useState<string>();
	const [highlight, setHighlight] = useState<HTMLElement>();

	useLayoutEffect(() => {
		if (!request || !data) return;
		const target = bottom.current?.parentElement?.querySelector<HTMLElement>(
			`[data-message-id="${CSS.escape(request)}"]`,
		);
		if (!target) return;
		// Run after useMessageScroll applies its history anchoring and any deferred jump to the end.
		const frame = requestAnimationFrame(() => {
			const scroll = bottom.current?.closest<HTMLElement>(".overflow-y-auto");
			if (scroll) {
				const row = target.getBoundingClientRect();
				const viewport = scroll.getBoundingClientRect();
				scroll.scrollTop += row.top - viewport.top - (scroll.clientHeight - row.height) / 2;
				// Report the real new position now, before a queued resize can follow the end again.
				scroll.dispatchEvent(new Event("scroll"));
			}
			setHighlight(target);
			setRequest(undefined);
		});
		return () => cancelAnimationFrame(frame);
	}, [bottom, data, request]);

	useEffect(() => {
		if (!request || !data || isFetching) return;
		if (bottom.current?.parentElement?.querySelector(`[data-message-id="${CSS.escape(request)}"]`)) return;
		if (hasNextPage && !isFetchNextPageError) {
			void fetchNextPage({ cancelRefetch: false });
			return;
		}
		notice({
			key: `message-quote-${request}`,
			text: t(isFetchNextPageError ? "chat.quoteLoadFailed" : "chat.quoteUnavailable"),
			tone: "error",
		});
		setRequest(undefined);
	}, [bottom, data, fetchNextPage, hasNextPage, isFetchNextPageError, isFetching, notice, request, t]);

	useLayoutEffect(() => {
		if (!highlight) return;
		highlight.setAttribute("data-message-highlighted", "");
		const timer = setTimeout(() => setHighlight(undefined), 1800);
		return () => {
			clearTimeout(timer);
			highlight.removeAttribute("data-message-highlighted");
		};
	}, [highlight]);

	return (id: string) => {
		setHighlight(undefined);
		setRequest(id);
	};
}
