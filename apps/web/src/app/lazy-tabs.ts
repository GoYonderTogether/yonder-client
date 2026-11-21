import { lazy } from "react";

const memoryPage = () => import("../pages/memory-page.tsx");
const tasksPage = () => import("../pages/tasks-page.tsx");
export const MemoryList = lazy(() => memoryPage().then((module) => ({ default: module.MemoryList })));
export const MemoryPage = lazy(() => memoryPage().then((module) => ({ default: module.MemoryPage })));
export const TasksList = lazy(() => tasksPage().then((module) => ({ default: module.TasksList })));
export const TaskPage = lazy(() => tasksPage().then((module) => ({ default: module.TaskPage })));
/**
 * On a phone, fetched once the first screen is idle, so the first tap on a tab never shows an
 * empty frame. A computer keeps loading each feature when it is opened (e2e/chunk-loading.spec.ts).
 */
export function preloadTabs(phone: boolean) {
	if (!phone) return;
	const load = () => void Promise.all([memoryPage(), tasksPage()]).catch(() => undefined);
	if (typeof requestIdleCallback === "function") requestIdleCallback(load, { timeout: 3000 });
	else setTimeout(load, 1500);
}
