import { useDismiss } from "@yonder/ui-shell";
import { Bug, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { DiagnosticsSections } from "./diagnostics.tsx";
import { Look } from "./look.tsx";
import { Navigation } from "./navigation.tsx";
import "./panel.css";

type Width = "full" | "390" | "820";

export default function DeveloperPanel() {
	const { pathname } = useLocation();
	const onAuthPage = pathname === "/sign-in" || pathname.startsWith("/setup/");
	const [open, setOpen] = useState(false);
	const [width, setWidth] = useState<Width>("full");
	const closeButton = useRef<HTMLButtonElement>(null);
	useDismiss(open, () => setOpen(false), 100);

	useEffect(() => {
		const root = document.getElementById("root");
		if (!root) return;
		root.style.maxWidth = width === "full" ? "" : `${width}px`;
		root.style.marginInline = width === "full" ? "" : "auto";
		return () => {
			root.style.maxWidth = "";
			root.style.marginInline = "";
		};
	}, [width]);

	useEffect(() => {
		const shortcut = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "d") {
				event.preventDefault();
				setOpen((current) => !current);
			}
		};
		const show = () => setOpen(true);
		window.addEventListener("keydown", shortcut);
		window.addEventListener("yonder:open-dev-panel", show);
		return () => {
			window.removeEventListener("keydown", shortcut);
			window.removeEventListener("yonder:open-dev-panel", show);
		};
	}, []);

	useEffect(() => {
		if (!open) return;
		const previous = document.activeElement;
		closeButton.current?.focus();
		return () => {
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, [open]);

	return (
		<>
			<button
				type="button"
				className={`dev-panel-trigger${onAuthPage ? " dev-panel-left" : ""}`}
				aria-label={open ? "Close developer panel" : "Open developer panel"}
				aria-expanded={open}
				aria-controls="developer-panel"
				onClick={() => setOpen((current) => !current)}
			>
				<Bug size={20} aria-hidden="true" />
			</button>
			<aside
				id="developer-panel"
				data-dev-panel="YONDER_DEV_PANEL_MARKER"
				className={`dev-panel${onAuthPage ? " dev-panel-left" : ""}`}
				aria-label="Developer panel"
				hidden={!open}
			>
				<header>
					<h2>Developer panel</h2>
					<button ref={closeButton} type="button" aria-label="Close developer panel" onClick={() => setOpen(false)}>
						<X size={18} aria-hidden="true" />
					</button>
				</header>
				<div className="dev-panel-content">
					<Navigation onNavigate={() => setOpen(false)} />
					<Look width={width} setWidth={setWidth} />
					<DiagnosticsSections />
				</div>
			</aside>
		</>
	);
}
