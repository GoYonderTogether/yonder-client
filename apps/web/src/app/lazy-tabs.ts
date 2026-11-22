import { lazy } from "react";
import { warmableImport } from "./warmable-import.ts";

const memoryPage = warmableImport(() => import("../pages/memory-page.tsx"));
const tasksPage = warmableImport(() => import("../pages/tasks-page.tsx"));
const settingsPage = warmableImport(() => import("./settings-pages.tsx"));
export const MemoryList = lazy(() => memoryPage().then((module) => ({ default: module.MemoryList })));
export const MemoryPage = lazy(() => memoryPage().then((module) => ({ default: module.MemoryPage })));
export const TasksList = lazy(() => tasksPage().then((module) => ({ default: module.TasksList })));
export const TaskPage = lazy(() => tasksPage().then((module) => ({ default: module.TaskPage })));
export const SettingsRoutePage = lazy(() => settingsPage().then((module) => ({ default: module.SettingsRoutePage })));

export function preloadFrameView(pathname: string) {
	const [tab, section] = pathname.split("/").filter(Boolean);
	const load =
		tab === "memory" ? memoryPage : tab === "tasks" ? tasksPage : tab === "me" && section ? settingsPage : null;
	if (load) void load().catch(() => undefined);
}
