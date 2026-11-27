import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app.tsx";
import { preloadPublicEntry } from "./app/router.tsx";
import { TrayPanel } from "./app/tray/panel.tsx";
import "./index.css";
import "./native-mobile.css";
import { setShellHaptics } from "@yonder/ui-shell";
import { haptic } from "./lib/haptics.ts";
import { isTauri } from "./lib/keychain.ts";
import { initializeNativeMobile } from "./lib/platform.ts";
import { isTrayPanel } from "./lib/tray-bridge.ts";
import { registerWebAppWorker } from "./lib/web-push.ts";

initializeNativeMobile();
setShellHaptics(haptic);

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

const tray = isTrayPanel();
if (!tray) preloadPublicEntry(location.pathname);
createRoot(root).render(<StrictMode>{tray ? <TrayPanel /> : <App />}</StrictMode>);

if (import.meta.env.PROD && !isTauri() && window.isSecureContext && "serviceWorker" in navigator) {
	window.addEventListener("load", () => void registerWebAppWorker().catch(() => {}), { once: true });
}
