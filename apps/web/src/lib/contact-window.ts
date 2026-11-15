import { isDesktopShell } from "./platform.ts";

export function isContactWindow(): boolean {
	return isDesktopShell() && window.location.pathname === "/contacts/add";
}

export async function openAddContactsWindow(title: string, query = ""): Promise<boolean> {
	if (!isDesktopShell()) return false;
	const { invoke } = await import("@tauri-apps/api/core");
	await invoke("open_add_contacts", { title, query: encodeURIComponent(query) });
	return true;
}

export async function notifyContactAdded(conversationId: string): Promise<void> {
	if (!isContactWindow()) return;
	const { invoke } = await import("@tauri-apps/api/core");
	await invoke("contact_added", { conversationId });
}

export async function closeContactWindow(): Promise<void> {
	if (!isDesktopShell() || isContactWindow()) return;
	const { invoke } = await import("@tauri-apps/api/core");
	await invoke("close_add_contacts");
}

export async function listenForContactAdded(onAdded: (conversationId: string) => void): Promise<() => void> {
	if (!isDesktopShell() || isContactWindow()) return () => undefined;
	const { listen } = await import("@tauri-apps/api/event");
	return listen<string>("contact-added", ({ payload }) => onAdded(payload));
}

/** Child windows borrow only access tokens; refresh rotation remains owned by the main window. */
export async function requestMainAccessToken(): Promise<string | null> {
	const [{ invoke }, { listen }] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event")]);
	const requestId = crypto.randomUUID();
	return new Promise((resolve) => {
		let unlisten: (() => void) | undefined;
		let settled = false;
		const finish = (token: string | null) => {
			settled = true;
			clearTimeout(timeout);
			unlisten?.();
			resolve(token);
		};
		const timeout = setTimeout(() => finish(null), 10_000);
		void listen<{ requestId: string; accessToken: string | null }>("contacts-session", ({ payload }) => {
			if (payload.requestId === requestId) finish(payload.accessToken);
		})
			.then((stop) => {
				if (settled) return stop();
				unlisten = stop;
				return invoke("request_main_session", { requestId });
			})
			.catch(() => finish(null));
	});
}

export async function serveContactWindowSession(client: {
	accessToken: string | null;
	refreshSession(): Promise<boolean>;
}): Promise<() => void> {
	if (!isDesktopShell() || isContactWindow()) return () => undefined;
	const [{ invoke }, { listen }] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event")]);
	return listen<string>("contacts-session-request", async ({ payload: requestId }) => {
		const ok = client.accessToken !== null && (await client.refreshSession());
		await invoke("provide_contacts_session", { requestId, accessToken: ok ? client.accessToken : null });
	});
}
