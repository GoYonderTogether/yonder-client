import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app.tsx";
import "./index.css";
import "./native-mobile.css";
import { initializeNativeMobile } from "./lib/platform.ts";

initializeNativeMobile();

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
