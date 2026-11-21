// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import {
	appleResourceStatuses,
	executeAppleResource,
	requestAppleResourcePermission,
	writeAppleResourceGrant,
} from "./apple-resources.ts";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./keychain.ts", () => ({ isTauri: () => true }));

test("keeps passive status, explicit OS consent, persistent grant, and agent execution separate", async () => {
	const context = { ownerId: "mem_a", deviceId: "dev_a", sessionId: "ses_a" };
	const grant = { id: "con_a", connectorId: "apple-photos", revision: 1 } as const;
	invoke.mockResolvedValueOnce({ "apple-photos": "undetermined" });
	await expect(appleResourceStatuses()).resolves.toMatchObject({ "apple-photos": "undetermined" });
	expect(invoke).toHaveBeenLastCalledWith("plugin:yonder-apple-resources|statuses", undefined);

	invoke.mockResolvedValueOnce("limited");
	await expect(requestAppleResourcePermission(grant.connectorId)).resolves.toBe("limited");
	expect(invoke).toHaveBeenLastCalledWith("plugin:yonder-apple-resources|request_permission", {
		connectorId: grant.connectorId,
	});
	await writeAppleResourceGrant(context, grant);
	expect(invoke).toHaveBeenLastCalledWith("plugin:yonder-apple-resources|authorize", { context, grant });

	const result = { kind: "apple_photos_read", id: "asset-id", text: "Example OCR", labels: ["document"] };
	invoke.mockResolvedValueOnce(result);
	await expect(
		executeAppleResource(context, {
			...grant,
			id: "cmd_a",
			connectionId: grant.id,
			deviceId: context.deviceId,
			scope: "device",
			capabilities: { fileTools: false },
			operation: "apple_photos_read",
			path: "",
			args: { id: "asset-id" },
			expiresAt: "2026-11-21T02:30:00Z",
			expiresAtMs: 1_795_312_200_000,
		}),
	).resolves.toEqual(result);
	expect(invoke).toHaveBeenLastCalledWith(
		"plugin:yonder-apple-resources|execute",
		expect.objectContaining({ context }),
	);
});
