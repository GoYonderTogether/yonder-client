import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app.tsx";
import { TrayPanel } from "./app/tray/panel.tsx";
import "./index.css";
import "./native-mobile.css";
import { setShellHaptics } from "@yonder/ui-shell";
import { haptic } from "./lib/haptics.ts";
import { initializeNativeMobile } from "./lib/platform.ts";
import { isTrayPanel } from "./lib/tray-bridge.ts";

initializeNativeMobile();
setShellHaptics(haptic);

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

createRoot(root).render(<StrictMode>{isTrayPanel() ? <TrayPanel /> : <App />}</StrictMode>);
