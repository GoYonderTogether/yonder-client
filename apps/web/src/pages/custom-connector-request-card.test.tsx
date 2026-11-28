// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ConnectorRequestView } from "@yonder/protocol";
import { createI18n } from "@yonder/ui-i18n";
import { I18nextProvider } from "react-i18next";
import { beforeEach, expect, test, vi } from "vitest";

/**
 * The Bot-written connector's card (20261128-people-archive 03 §2). Confirmation happens on the
 * target device, so this card must never offer the in-app allow on a non-target screen, and on the
 * target it must call the device's own confirm command with the hash the card displays.
 */
const state = vi.hoisted(() => ({
	context: { ownerId: "mem_a", deviceId: "dev_a", sessionId: "ses_a" } as {
		ownerId: string;
		deviceId: string;
		sessionId: string;
	} | null,
	invoke: vi.fn(),
	tauri: true,
}));

vi.mock("../lib/local-files.ts", () => ({
	invokeLocalFiles: state.invoke,
	useLocalFilesContext: () => state.context,
}));
vi.mock("../lib/custom-connectors-runtime.tsx", async (original) => {
	const actual = await original<typeof import("../lib/custom-connectors-runtime.tsx")>();
	return { ...actual, customConnectorsSupported: () => state.tauri };
});

import { CustomConnectorRequestCard } from "./custom-connector-request-card.tsx";

const manifest = {
	id: "notes",
	name: "Notes",
	description: "Reads the notes app.",
	brand: "notes",
	tools: [
		{ name: "lookup", description: "Find a note.", mode: "query" as const, input: {} },
		{ name: "append", description: "Add a line.", mode: "act" as const, input: {} },
	],
	events: {
		note: {
			level: 1 as const,
			timeline: "direct" as const,
			weight: 1 as const,
			visibility: "private" as const,
			reason: "Notes.",
		},
	},
	poll: { tool: "lookup", everySeconds: 60, reason: "Cheap." },
};

function view(overrides: Partial<ConnectorRequestView> = {}): ConnectorRequestView {
	return {
		id: "request",
		connectorIds: ["custom:notes"],
		reason: "To read your notes",
		state: "pending",
		deviceId: "dev_a",
		deviceName: "MacBook Pro",
		connectionIds: ["con_c"],
		failure: null,
		proposal: {
			connectorId: "custom:notes",
			slug: "notes",
			manifest,
			entrySha256: "a".repeat(64),
			revision: 1,
			deviceId: "dev_a",
			deviceName: "MacBook Pro",
		},
		...overrides,
	};
}

function show(row: ConnectorRequestView) {
	return render(
		<I18nextProvider i18n={createI18n("en")}>
			<CustomConnectorRequestCard row={row} />
		</I18nextProvider>,
	);
}

beforeEach(() => {
	vi.resetAllMocks();
	state.context = { ownerId: "mem_a", deviceId: "dev_a", sessionId: "ses_a" };
	state.tauri = true;
});

test("the card names the device and every tool's read or write in words", () => {
	show(view());
	expect(screen.getByText("Notes on MacBook Pro")).toBeVisible();
	expect(screen.getByText("Reads Notes")).toBeVisible();
	expect(screen.getByText("Changes Notes")).toBeVisible();
});

test("on the target device, confirming calls the device's own command with the hash the card shows", async () => {
	state.invoke.mockResolvedValue("ok");
	show(view());
	fireEvent.click(screen.getByRole("button", { name: "Allow" }));
	await waitFor(() =>
		expect(state.invoke).toHaveBeenCalledWith("custom_connector_confirm", {
			context: state.context,
			confirm: { connectionId: "con_c", revision: 1, slug: "notes", entrySha256: "a".repeat(64) },
		}),
	);
});

test("a re-proposal confirms at the card's own revision and hash, never a guessed 1", async () => {
	state.invoke.mockResolvedValue("ok");
	show(
		view({
			connectionIds: [],
			proposal: {
				connectorId: "custom:notes",
				slug: "notes",
				manifest,
				entrySha256: "b".repeat(64),
				revision: 2,
				deviceId: "dev_a",
				deviceName: "MacBook Pro",
			},
		}),
	);
	fireEvent.click(screen.getByRole("button", { name: "Allow" }));
	await waitFor(() =>
		expect(state.invoke).toHaveBeenCalledWith("custom_connector_confirm", {
			context: state.context,
			confirm: { revision: 2, slug: "notes", entrySha256: "b".repeat(64) },
		}),
	);
});

test("another device, or a browser, has no allow: it tells the owner to confirm there", () => {
	state.context = { ownerId: "mem_a", deviceId: "dev_b", sessionId: "ses_b" };
	show(view());
	expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
	expect(screen.getByText(/On MacBook Pro/)).toBeVisible();
});

test("a changed package is a plain sentence, not an error code", async () => {
	state.invoke.mockRejectedValue(new Error("needs_reauth"));
	show(view());
	fireEvent.click(screen.getByRole("button", { name: "Allow" }));
	await waitFor(() => expect(screen.getByText(/files changed since this card was written/)).toBeVisible());
});

test("a settled card shows its state and no action", () => {
	show(view({ state: "granted" }));
	expect(screen.getByText("Allowed")).toBeVisible();
	expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
});
