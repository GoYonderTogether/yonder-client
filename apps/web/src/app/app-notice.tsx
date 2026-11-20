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
const ICONS = { info: Info, warning: TriangleAlert, error: CircleAlert };
const PRIORITY: Record<Tone, number> = { info: 0, warning: 1, error: 2 };
const NOTICE_MS = 4_500;
const RECONNECT_NOTICE = "realtime-reconnecting";
const RECONNECT_GRACE_MS = 3_000;

export function useAppNotice() {
	return useContext(NoticeContext).show;
}

export function useDismissAppNotice() {
	return useContext(NoticeContext).dismiss;
}

export function AppNoticeProvider({ children, scope }: { children: ReactNode; scope?: string | undefined }) {
	const [notice, setNotice] = useState<ActiveNotice | null>(null);
	const currentScope = useRef(scope);
	useLayoutEffect(() => {
		currentScope.current = scope;
	}, [scope]);
	const show = useCallback(
		(next: Notice) => {
			if (currentScope.current !== scope) return;
			setNotice((active) => {
				if (active && active.scope === scope) {
					if (active.key === next.key || PRIORITY[active.tone ?? "info"] > PRIORITY[next.tone ?? "info"]) return active;
				}
				return { ...next, scope };
			});
		},
		[scope],
	);
	const dismiss = useCallback(
		(key: string) => setNotice((active) => (active?.key === key && active.scope === scope ? null : active)),
		[scope],
	);
	const controls = useMemo(() => ({ show, dismiss }), [show, dismiss]);
	const visible = notice?.scope === scope ? notice : null;
	useEffect(() => {
		setNotice((active) => (active?.scope === scope ? active : null));
	}, [scope]);
	useEffect(() => {
		if (!notice) return;
		const timer = setTimeout(() => setNotice((active) => (active === notice ? null : active)), NOTICE_MS);
		return () => clearTimeout(timer);
	}, [notice]);
	const tone = visible?.tone ?? "info";
	const Icon = ICONS[tone];
	return (
		<NoticeContext.Provider value={controls}>
			{children}
			<div className="app-notice-viewport" role="status" aria-atomic="true">
				{visible ? (
					<div key={visible.key} className="app-notice" data-tone={tone}>
						<Icon className="app-notice-icon" aria-hidden="true" />
						<span>{visible.text}</span>
					</div>
				) : null}
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
