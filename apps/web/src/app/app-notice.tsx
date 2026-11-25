import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useForeground } from "../lib/foreground.ts";
import "./app-notice.css";

type Tone = "info" | "warning" | "error";
type Notice = { key: string; text: string; tone?: Tone };
type ActiveNotice = Notice & { scope: string | undefined };

const NO_NOTICES = { show: (_notice: Notice) => {}, dismiss: (_key: string) => {} };
const NoticeContext = createContext(NO_NOTICES);
const TopNoticeTarget = createContext<HTMLDivElement | null>(null);
const ICONS = { info: Info, warning: TriangleAlert, error: CircleAlert };
const NOTICE_MS = 4_500;
const RECONNECT_NOTICE = "realtime-reconnecting";
const RECONNECT_GRACE_MS = 3_000;

export function useTopNoticeTarget() {
	return useContext(TopNoticeTarget);
}

export function useAppNotice() {
	return useContext(NoticeContext).show;
}

export function useDismissAppNotice() {
	return useContext(NoticeContext).dismiss;
}

export function AppNoticeProvider({ children, scope }: { children: ReactNode; scope?: string | undefined }) {
	const [queue, setQueue] = useState<ActiveNotice[]>([]);
	const visible = queue[0]?.scope === scope ? queue[0] : undefined;
	const [target, setTarget] = useState<HTMLDivElement | null>(null);
	const currentScope = useRef(scope);
	useLayoutEffect(() => {
		currentScope.current = scope;
	}, [scope]);
	const show = useCallback(
		(next: Notice) => {
			if (currentScope.current !== scope) return;
			setQueue((pending) => {
				const sameScope = pending.filter((item) => item.scope === scope);
				if (sameScope.some((item) => item.key === next.key)) return pending;
				return [...sameScope, { ...next, scope }];
			});
		},
		[scope],
	);
	const dismiss = useCallback(
		(key: string) => {
			setQueue((pending) => {
				if (!pending.some((item) => item.key === key && item.scope === scope)) return pending;
				return pending.filter((item) => item.key !== key || item.scope !== scope);
			});
		},
		[scope],
	);
	const controls = useMemo(() => ({ show, dismiss }), [show, dismiss]);
	useEffect(() => {
		setQueue((pending) => {
			const current = pending.filter((item) => item.scope === scope);
			return current.length === pending.length ? pending : current;
		});
	}, [scope]);
	useEffect(() => {
		if (!visible) return;
		const timer = setTimeout(
			() => setQueue((pending) => (pending[0] === visible ? pending.slice(1) : pending)),
			NOTICE_MS,
		);
		return () => clearTimeout(timer);
	}, [visible]);
	const tone = visible?.tone ?? "info";
	const Icon = ICONS[tone];
	return (
		<NoticeContext.Provider value={controls}>
			<TopNoticeTarget.Provider value={target}>{children}</TopNoticeTarget.Provider>
			<div className="app-notice-viewport" ref={setTarget}>
				<div className="app-notice-status" role="status" aria-atomic="true">
					{visible ? (
						<div key={visible.key} className="app-notice app-notice-surface" data-tone={tone}>
							<Icon className="app-notice-icon" aria-hidden="true" />
							<span>{visible.text}</span>
						</div>
					) : null}
				</div>
			</div>
		</NoticeContext.Provider>
	);
}

/** One notice per sustained interruption of a foreground conversation. The socket owns retries. */
export function useReconnectNotice(disconnected: boolean, relevant: boolean, personId: string | undefined) {
	const { t } = useTranslation();
	const foreground = useForeground();
	const { show, dismiss } = useContext(NoticeContext);
	const shownFor = useRef<string | null>(null);
	const label = t("chat.reconnecting");
	useEffect(() => {
		if (!disconnected) {
			shownFor.current = null;
			dismiss(RECONNECT_NOTICE);
			return;
		}
		if (!personId || !relevant || !foreground) {
			dismiss(RECONNECT_NOTICE);
			return;
		}
		if (shownFor.current === personId) return;
		const wait = setTimeout(() => {
			shownFor.current = personId;
			show({ key: RECONNECT_NOTICE, text: label, tone: "warning" });
		}, RECONNECT_GRACE_MS);
		return () => clearTimeout(wait);
	}, [disconnected, relevant, foreground, personId, label, show, dismiss]);
}
