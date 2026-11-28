import type { LocalFilesContext } from "./local-files.ts";

/**
 * Desktop control's native side, as the runtime sees it: a command goes to `desktop_execute`, which
 * re-checks the grant and returns the connector result directly (its own `{ ok, error, permission? }`
 * body, because a missing system permission carries which one). Thin wrappers so the runtime never
 * imports Tauri directly (it must also load in a browser and in tests).
 */

export async function executeDesktop<T>(context: LocalFilesContext, command: unknown): Promise<T> {
	const { invoke } = await import("@tauri-apps/api/core");
	return invoke<T>("desktop_execute", { context, command });
}
