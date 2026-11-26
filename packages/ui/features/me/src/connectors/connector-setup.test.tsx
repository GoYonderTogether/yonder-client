// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useSetupConnectors } from "./connector-setup.tsx";

const state = vi.hoisted(() => ({
	catalog: vi.fn((apple: boolean) => ({
		data: {
			items: apple
				? [
						{ id: "apple-calendar", platforms: ["ios", "macos"] },
						{ id: "apple-photos", platforms: ["ios", "macos"] },
						{ id: "apple-notes", platforms: ["macos"] },
					]
				: [],
		},
	})),
	connections: vi.fn((_options: { apple: boolean }) => ({ data: { items: [] } })),
}));
vi.mock("@yonder/ui-data", () => ({
	useConnectorCatalog: state.catalog,
	useConnectors: state.connections,
	useDevices: () => ({ data: { items: [{ id: "phone", platform: "ios", current: true }] } }),
}));

test("iOS setup opts into the Apple catalog and lists only usable connectors for this device", () => {
	const native = { supported: true, supports: () => true, authorize: vi.fn(), revoke: vi.fn() };
	const setup = renderHook(() => useSetupConnectors(native));
	expect(state.catalog).toHaveBeenCalledWith(true);
	expect(state.connections).toHaveBeenCalledWith({ apple: true });
	expect(setup.result.current.definitions.map(({ id }) => id)).toEqual(["apple-calendar", "apple-photos"]);
	expect(renderHook(() => useSetupConnectors()).result.current.definitions).toEqual([]);
});
