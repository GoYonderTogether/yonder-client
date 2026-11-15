// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { createLocalFilesAdapter, localFilesSupported, onLocalFilesChanged, resetLocalFiles } from "./local-files.ts";

afterEach(() => {
	Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
	vi.restoreAllMocks();
	invoke.mockReset();
});

test("explicit authorization preserves scope, capabilities and revision without selecting a folder", async () => {
	expect(localFilesSupported()).toBe(false);
	Object.defineProperty(window, "__TAURI_INTERNALS__", {
		value: { metadata: { currentWindow: { label: "main" } } },
		configurable: true,
	});
	vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Macintosh");
	const context = { ownerId: "mem_a", deviceId: "dev_a", sessionId: "ses_a" };
	const adapter = createLocalFilesAdapter(context);
	const listener = vi.fn();
	const stop = onLocalFilesChanged(listener);
	const config = {
		id: "con_a",
		connectorId: "local-files" as const,
		scope: "device" as const,
		capabilities: { fileTools: false },
		revision: 2,
	};
	await adapter.authorize(config);
	expect(invoke).toHaveBeenCalledWith("local_files_authorize", { context, config });
	expect(invoke.mock.calls.some(([name]) => name === "local_files_choose")).toBe(false);
	await adapter.revoke("con_a");
	await resetLocalFiles();
	expect(invoke).toHaveBeenLastCalledWith("local_files_reset", {});
	expect(listener).toHaveBeenCalledTimes(3);
	stop();
	vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone");
	expect(localFilesSupported()).toBe(false);
});
