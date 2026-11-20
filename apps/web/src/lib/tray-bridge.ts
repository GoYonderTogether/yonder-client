import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isDesktopShell } from "./platform.ts";

export type TrayAction = "open-main" | "settings" | "check-updates" | "quit" | "dismiss";
export type TrayMainAction = Extract<TrayAction, "settings" | "check-updates">;
export type TrayActivity = {
	botId: string;
	botName: string;
	entries: { id: string; conversationTitle: string; activity: string }[];
}[];

export type TraySnapshot = { groups: TrayActivity; unattributed: boolean };

export function isTrayPanel() {
	return (
		isDesktopShell() &&
		new URLSearchParams(location.search).get("tray-panel") === "1" &&
		getCurrentWebviewWindow().label === "tray-panel"
	);
}

async function publishTrayActivity(activity: TraySnapshot) {
	const { invoke } = await import("@tauri-apps/api/core");
	await invoke("tray_publish_activity", { activity });
}

type LocalActivity = {
	botId: string;
	botName: string;
	conversationId: string;
	conversationTitle: string;
	activity: string;
};
const activeConnectorWork = new Map<symbol, LocalActivity | null>();
let pendingReport = Promise.resolve();

export function beginTrayConnectorWork(row: LocalActivity | null) {
	if (!isDesktopShell())
		return { attribute: (_row: LocalActivity) => undefined, update: () => undefined, finish: () => undefined };
	const key = Symbol();
	let latestActivity = row?.activity;
	activeConnectorWork.set(key, row);
	reportConnectorWork();
	return {
		attribute(next: LocalActivity) {
			if (!activeConnectorWork.has(key)) return;
			activeConnectorWork.set(key, { ...next, activity: latestActivity ?? next.activity });
			reportConnectorWork();
		},
		update(activity: string) {
			latestActivity = activity;
			const current = activeConnectorWork.get(key);
			if (!current) return;
			activeConnectorWork.set(key, { ...current, activity });
			reportConnectorWork();
		},
		finish() {
			if (activeConnectorWork.delete(key)) reportConnectorWork();
		},
	};
}

function reportConnectorWork() {
	const groups = new Map<string, TrayActivity[number]>();
	let unattributed = false;
	for (const row of activeConnectorWork.values()) {
		if (!row) {
			unattributed = true;
			continue;
		}
		let group = groups.get(row.botId);
		if (!group) {
			group = { botId: row.botId, botName: row.botName, entries: [] };
			groups.set(row.botId, group);
		}
		if (!group.entries.some((entry) => entry.id === row.conversationId)) {
			group.entries.push({ id: row.conversationId, conversationTitle: row.conversationTitle, activity: row.activity });
		}
	}
	const snapshot = {
		groups: [...groups.values()]
			.sort((a, b) => a.botId.localeCompare(b.botId))
			.map((group) => ({
				...group,
				entries: group.entries.sort((a, b) => a.id.localeCompare(b.id)),
			})),
		unattributed,
	};
	pendingReport = pendingReport.then(() => publishTrayActivity(snapshot)).catch(() => {});
}

export async function observeTrayActivity(onActivity: (activity: TraySnapshot) => void, onUnavailable: () => void) {
	const { invoke } = await import("@tauri-apps/api/core");
	const event = "yonder-tray-activity";
	let readId = 0;
	let disposed = false;
	const refresh = () => {
		const id = ++readId;
		void invoke<TraySnapshot | null>("tray_get_activity")
			.then((snapshot) => {
				if (disposed || id !== readId) return;
				if (snapshot && Array.isArray(snapshot.groups) && typeof snapshot.unattributed === "boolean") {
					onActivity(snapshot);
				} else if (snapshot === null) {
					onActivity({ groups: [], unattributed: false });
				} else {
					onUnavailable();
				}
			})
			.catch(() => {
				if (!disposed && id === readId) onUnavailable();
			});
	};
	window.addEventListener(event, refresh);
	refresh();
	return () => {
		disposed = true;
		window.removeEventListener(event, refresh);
	};
}

export async function sendTrayAction(action: TrayAction) {
	const { invoke } = await import("@tauri-apps/api/core");
	await invoke("tray_panel_action", { action });
}

export async function listenForTrayMainAction(onAction: (action: TrayMainAction) => void) {
	if (!isDesktopShell() || getCurrentWebviewWindow().label !== "main") return () => undefined;
	const { listen } = await import("@tauri-apps/api/event");
	return listen<TrayMainAction>("tray-main-action", ({ payload }) => onAction(payload));
}
